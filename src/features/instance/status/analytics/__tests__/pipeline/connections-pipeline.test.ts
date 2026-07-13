import { describe, expect, it } from 'vitest';
import { connectionsSpec } from '../../pipeline/connections';
import { runPipeline } from '../../pipeline/pipeline';

describe('connections pipeline', () => {
	// connections is a multi-source merge (mqtt-connections + ws-connections)
	// in the rendered panel; the spec itself keys on a synthesized `type`
	// field. Below we feed pre-merged rows directly into runPipeline, which
	// is what the panel does after tagging each source row with type.
	const records = [
		// 2 nodes, 2 timestamps, 2 types.
		{ time: 100, node: 'n1', type: 'mqtt', connections: 50, count: 1, period: 60000 },
		{ time: 100, node: 'n1', type: 'ws', connections: 10, count: 1, period: 60000 },
		{ time: 100, node: 'n2', type: 'mqtt', connections: 60, count: 1, period: 60000 },
		{ time: 100, node: 'n2', type: 'ws', connections: 5, count: 1, period: 60000 },
		{ time: 200, node: 'n1', type: 'mqtt', connections: 70, count: 1, period: 60000 },
		{ time: 200, node: 'n2', type: 'mqtt', connections: 65, count: 1, period: 60000 },
	] as any;

	it('emits 2 series (mqtt, ws), time-bucketed', () => {
		const out = runPipeline(connectionsSpec, records, { startTime: 0, endTime: 1000 }, []);
		expect(out.series.length).toBe(2);
		const mqtt = out.series.find((s) => s.key === 'mqtt');
		const ws = out.series.find((s) => s.key === 'ws');
		expect(mqtt).toBeTruthy();
		expect(ws).toBeTruthy();
	});

	it('mqtt at t=100 is sum across nodes (50 + 60 = 110); peak within node', () => {
		const out = runPipeline(connectionsSpec, records, { startTime: 0, endTime: 1000 }, []);
		const mqtt = out.series.find((s) => s.key === 'mqtt')!;
		const at100 = mqtt.points.find((p) => p.x === 100)?.y;
		expect(at100).toBe(110);
	});

	it('mqtt at t=200 sums across nodes (70 + 65 = 135) even though only mqtt records', () => {
		const out = runPipeline(connectionsSpec, records, { startTime: 0, endTime: 1000 }, []);
		const mqtt = out.series.find((s) => s.key === 'mqtt')!;
		const at200 = mqtt.points.find((p) => p.x === 200)?.y;
		expect(at200).toBe(135);
	});

	it('ws at t=200 is absent (no records) — sparse bucket', () => {
		const out = runPipeline(connectionsSpec, records, { startTime: 0, endTime: 1000 }, []);
		const ws = out.series.find((s) => s.key === 'ws')!;
		expect(ws.points.length).toBe(1);
		expect(ws.points[0].x).toBe(100);
	});
});
