import { describe, expect, it } from 'vitest';
import { sortByMagnitude } from '../../primitives/sortByMagnitude';

describe('sortByMagnitude', () => {
	it('orders series by sum across all points (descending)', () => {
		const series = [
			{ key: 'small', label: 'small', points: [{ x: 1, y: 5 }, { x: 2, y: 5 }] }, // sum 10
			{ key: 'big', label: 'big', points: [{ x: 1, y: 100 }, { x: 2, y: 50 }] }, // sum 150
			{ key: 'medium', label: 'medium', points: [{ x: 1, y: 30 }, { x: 2, y: 30 }] }, // sum 60
		];
		const sorted = sortByMagnitude(series);
		expect(sorted.map((s) => s.key)).toEqual(['big', 'medium', 'small']);
	});

	it('treats null y as 0 (sparse-tail OK)', () => {
		const series = [
			{ key: 'a', label: 'a', points: [{ x: 1, y: 100 }, { x: 2, y: null as number | null }] }, // sum 100
			{ key: 'b', label: 'b', points: [{ x: 1, y: 50 }, { x: 2, y: 50 }] }, // sum 100
		];
		const sorted = sortByMagnitude(series);
		// Stable: ties preserve input order.
		expect(sorted.map((s) => s.key)).toEqual(['a', 'b']);
	});

	it('handles empty series array', () => {
		expect(sortByMagnitude([])).toEqual([]);
	});

	it('handles single-element series array', () => {
		const series = [{ key: 'a', label: 'a', points: [{ x: 0, y: 42 }] }];
		expect(sortByMagnitude(series)).toEqual(series);
	});
});
