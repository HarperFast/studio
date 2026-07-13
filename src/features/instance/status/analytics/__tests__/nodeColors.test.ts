import { describe, expect, it } from 'vitest';
import { getNodeColor, NODE_PALETTE } from '../lib/nodeColors';

describe('getNodeColor', () => {
	it('assigns colors based on sorted node order', () => {
		const nodes = ['node-c', 'node-a', 'node-b'];
		expect(getNodeColor('node-a', nodes)).toBe(NODE_PALETTE[0]);
		expect(getNodeColor('node-b', nodes)).toBe(NODE_PALETTE[1]);
		expect(getNodeColor('node-c', nodes)).toBe(NODE_PALETTE[2]);
	});

	it('returns consistent colors across calls', () => {
		const nodes = ['x', 'y', 'z'];
		const first = getNodeColor('y', nodes);
		const second = getNodeColor('y', nodes);
		expect(first).toBe(second);
	});

	it('wraps around palette for many nodes', () => {
		const nodes = Array.from({ length: 15 }, (_, i) => `node-${String(i).padStart(2, '0')}`);
		const color = getNodeColor('node-10', nodes);
		expect((NODE_PALETTE as readonly string[]).includes(color)).toBeTruthy();
	});
});
