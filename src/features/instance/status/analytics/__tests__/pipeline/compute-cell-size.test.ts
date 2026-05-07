import { describe, expect, it } from 'vitest';
import { computeCellSize } from '../../primitives/computeCellSize.ts';

describe('computeCellSize', () => {
	it('returns MAX when container is wide enough', () => {
		// 800 wide, 3 cols, 200 row-label, 4 gap → per-cell ≈ 197 → clamp to 80.
		expect(computeCellSize(800, 3, 200, 4, 40, 80)).toBe(80);
	});

	it('shrinks below MAX when container is narrow but above MIN', () => {
		// 400 wide, 3 cols, 200 row-label, 4 gap → 192/3 = 64.
		expect(computeCellSize(400, 3, 200, 4, 40, 80)).toBe(64);
	});

	it('clamps to MIN floor when container is tiny', () => {
		// 100 wide, 3 cols, 200 row-label → negative; clamp to 40.
		expect(computeCellSize(100, 3, 200, 4, 40, 80)).toBe(40);
	});

	it('handles single-column grid', () => {
		// 400 wide, 1 col, 200 row-label, 0 gap → 200; clamp to 80.
		expect(computeCellSize(400, 1, 200, 4, 40, 80)).toBe(80);
	});
});
