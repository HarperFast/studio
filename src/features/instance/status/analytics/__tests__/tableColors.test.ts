import { describe, expect, it } from 'vitest';
import { getTableColor, OTHER_COLOR, TABLE_PALETTE } from '../lib/tableColors.ts';

describe('getTableColor', () => {
	it('returns distinct colors for the first 8 indices', () => {
		const colors = new Set<string>();
		for (let i = 0; i < 8; i++) { colors.add(getTableColor(i)); }
		expect(colors.size).toBe(8);
	});

	it('wraps around the palette', () => {
		const c0 = getTableColor(0);
		const cN = getTableColor(TABLE_PALETTE.length);
		expect(c0).toBe(cN);
	});

	it('is deterministic', () => {
		expect(getTableColor(3)).toBe(getTableColor(3));
	});

	it('exports OTHER_COLOR as a chart-token reference (value checked in paletteDisjointness)', () => {
		expect(OTHER_COLOR).toMatch(/^var\(--chart-[\w-]+\)$/);
	});
});
