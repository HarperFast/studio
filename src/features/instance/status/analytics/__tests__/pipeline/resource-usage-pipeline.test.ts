import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../pipeline/pipeline';
import { resourceUsageSpec } from '../../pipeline/resource-usage';

const records = [
	{
		time: 100,
		node: 'n1',
		cpuUtilization: 6.93,
		fsWrite: 3_000_000,
		majorPageFault: 5,
		voluntaryContextSwitches: 1000,
		involuntaryContextSwitches: 500,
		period: 60_000,
	},
	{
		time: 200,
		node: 'n1',
		cpuUtilization: 8.5,
		fsWrite: 4_000_000,
		majorPageFault: 7,
		voluntaryContextSwitches: 1500,
		involuntaryContextSwitches: 700,
		period: 60_000,
	},
] as any;

describe('resource-usage pipeline', () => {
	it('emits 4 series corresponding to the 4 FieldSpecs', () => {
		const out = runPipeline(resourceUsageSpec, records, { startTime: 0, endTime: 1000 }, []);
		expect(out.series.length).toBe(4);
	});

	it('cpuUtilization series passes through unscaled (cores-equivalent); time-bucketed', () => {
		const out = runPipeline(resourceUsageSpec, records, { startTime: 0, endTime: 1000 }, []);
		const cpu = out.series.find((s) => /cpu|cores/i.test(s.label))!;
		expect(cpu).toBeTruthy();
		expect(cpu.points.length).toBe(2);
		expect(cpu.points.map((p) => p.x)).toEqual([100, 200]);
		// cpuUtilization is already in cores-equivalent units; no transform.
		expect(Math.abs((cpu.points[0].y as number) - 6.93) < 0.005, `t=100: expected ~6.93; got ${cpu.points[0].y}`)
			.toBeTruthy();
		expect(Math.abs((cpu.points[1].y as number) - 8.5) < 0.005, `t=200: expected ~8.5; got ${cpu.points[1].y}`)
			.toBeTruthy();
	});

	it('fsWrite series applies rate transform (B/s); time-bucketed', () => {
		const out = runPipeline(resourceUsageSpec, records, { startTime: 0, endTime: 1000 }, []);
		const fs = out.series.find((s) => /disk write/i.test(s.label))!;
		expect(fs).toBeTruthy();
		expect(fs.points.length).toBe(2);
		expect(Math.abs((fs.points[0].y as number) - 50_000) < 1, `t=100: expected 50k; got ${fs.points[0].y}`)
			.toBeTruthy();
		expect(Math.abs((fs.points[1].y as number) - 66_667) < 1, `t=200: expected ~66.7k; got ${fs.points[1].y}`)
			.toBeTruthy();
	});

	it('context switches FieldExpr sums voluntary + involuntary, then rate', () => {
		const out = runPipeline(resourceUsageSpec, records, { startTime: 0, endTime: 1000 }, []);
		const cs = out.series.find((s) => /context switches/i.test(s.label))!;
		expect(cs).toBeTruthy();
		expect(cs.points.length).toBe(2);
		expect(Math.abs((cs.points[0].y as number) - 25) < 0.1, `t=100: expected 25; got ${cs.points[0].y}`).toBeTruthy();
		expect(Math.abs((cs.points[1].y as number) - 36.667) < 0.1, `t=200: expected ~36.67; got ${cs.points[1].y}`)
			.toBeTruthy();
	});
});

describe('resource-usage cross-node behavior (multi-node)', () => {
	const multiNodeRecords = [
		// At t=100: n1 has small page fault count, n2 has high.
		{
			time: 100,
			node: 'n1',
			cpuUtilization: 6.93,
			fsWrite: 3_000_000,
			majorPageFault: 5,
			voluntaryContextSwitches: 1000,
			involuntaryContextSwitches: 500,
			period: 60_000,
		},
		{
			time: 100,
			node: 'n2',
			cpuUtilization: 8.5,
			fsWrite: 4_000_000,
			majorPageFault: 20,
			voluntaryContextSwitches: 1500,
			involuntaryContextSwitches: 700,
			period: 60_000,
		},
	] as any;

	it('majorPageFault crossNode=max picks noisiest node (not cluster sum)', () => {
		const out = runPipeline(resourceUsageSpec, multiNodeRecords, { startTime: 0, endTime: 1000 }, []);
		const pf = out.series.find((s) => /page faults/i.test(s.label))!;
		const yAt100 = pf!.points.find((p) => p.x === 100)?.y as number;
		// n1: 5/60000*1000 ≈ 0.0833. n2: 20/60000*1000 ≈ 0.333. crossNode max: 0.333.
		expect(Math.abs(yAt100 - 0.333) < 0.01, `expected ~0.333 (max across nodes); got ${yAt100}`).toBeTruthy();
	});

	it('contextSwitches crossNode=max picks noisiest node', () => {
		const out = runPipeline(resourceUsageSpec, multiNodeRecords, { startTime: 0, endTime: 1000 }, []);
		const cs = out.series.find((s) => /context switches/i.test(s.label))!;
		const yAt100 = cs!.points.find((p) => p.x === 100)?.y as number;
		// n1: (1000+500)/60000*1000 = 25. n2: (1500+700)/60000*1000 ≈ 36.67. crossNode max: 36.67.
		expect(Math.abs(yAt100 - 36.667) < 0.5, `expected ~36.67 (max); got ${yAt100}`).toBeTruthy();
	});

	it('fsWrite crossNode=sum sums across nodes (associative with temporal=sum)', () => {
		const out = runPipeline(resourceUsageSpec, multiNodeRecords, { startTime: 0, endTime: 1000 }, []);
		const fs = out.series.find((s) => /disk write/i.test(s.label))!;
		const yAt100 = fs!.points.find((p) => p.x === 100)?.y as number;
		// n1: 3M/60k*1000 = 50000. n2: 4M/60k*1000 ≈ 66667. crossNode sum: 116667.
		expect(Math.abs(yAt100 - 116_667) < 1, `expected ~116.67k (sum across nodes); got ${yAt100}`).toBeTruthy();
	});
});
