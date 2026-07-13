import { describe, expect, it } from 'vitest';
import { groupSections } from '../OverviewTab';

describe('groupSections', () => {
	it('returns an empty list for empty input', () => {
		expect(groupSections({})).toEqual([]);
	});

	it('puts top-level scalars under a synthetic "General" section', () => {
		const out = groupSections({ host: 'h1', port: 9925 });
		expect(out).toHaveLength(1);
		expect(out[0].title).toBe('General');
		expect(out[0].rows.map((r) => r.name).sort()).toEqual(['host', 'port']);
		expect(out[0].subSections).toEqual([]);
	});

	it('groups a flat object under one section', () => {
		const out = groupSections({ system: { hostname: 'h1', kernel: '6.1' } });
		expect(out).toHaveLength(1);
		expect(out[0].title).toBe('system');
		expect(out[0].rows.map((r) => r.name).sort()).toEqual(['hostname', 'kernel']);
	});

	it('nests when a section contains a sub-object', () => {
		const out = groupSections({
			system: {
				hostname: 'h1',
				cpu: { cores: 8, brand: 'M4' },
			},
		});
		expect(out).toHaveLength(1);
		const system = out[0];
		expect(system.title).toBe('system');
		expect(system.rows.map((r) => r.name)).toEqual(['hostname']);
		expect(system.subSections).toHaveLength(1);
		expect(system.subSections[0].title).toBe('cpu');
		expect(system.subSections[0].rows.map((r) => r.name).sort()).toEqual(['brand', 'cores']);
	});

	it('handles sibling sub-sections at the same depth', () => {
		const out = groupSections({
			system: { kernel: '6.1' },
			memory: { total: 16, free: 4 },
		});
		expect(out).toHaveLength(2);
		expect(out.map((s) => s.title)).toEqual(['system', 'memory']);
	});

	it('does not let a deep section eat the next sibling at a shallower depth', () => {
		// Depth regression: after descending into system.cpu, the next top-level
		// key (memory) must reset the stack and start a new top section.
		const out = groupSections({
			system: { cpu: { cores: 8 } },
			memory: { total: 16 },
		});
		expect(out.map((s) => s.title)).toEqual(['system', 'memory']);
		expect(out[0].subSections[0].title).toBe('cpu');
		expect(out[0].subSections[0].rows.map((r) => r.name)).toEqual(['cores']);
		expect(out[1].subSections).toEqual([]);
		expect(out[1].rows.map((r) => r.name)).toEqual(['total']);
	});

	it('mixes top-level scalars with grouped sub-objects', () => {
		const out = groupSections({
			version: '4.7.0',
			system: { hostname: 'h1' },
		});
		// "General" is unshifted to the front of `top`
		expect(out[0].title).toBe('General');
		expect(out[0].rows.map((r) => r.name)).toEqual(['version']);
		expect(out[1].title).toBe('system');
	});
});
