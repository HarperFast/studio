import { describe, expect, it } from 'vitest';
import { TYPE_PALETTE } from '../lib/colorAllocators/typeColors.ts';
import { NODE_PALETTE } from '../lib/nodeColors.ts';
import { TABLE_PALETTE } from '../lib/tableColors.ts';

describe('categorical palettes', () => {
	it('node, table, and type palettes are pairwise disjoint', () => {
		const palettes = { NODE_PALETTE, TABLE_PALETTE, TYPE_PALETTE };
		const seen = new Map<string, string>();
		for (const [name, palette] of Object.entries(palettes)) {
			for (const color of palette) {
				const key = color.toLowerCase();
				expect(seen.get(key), `${color} appears in both ${seen.get(key)} and ${name}`).toBeUndefined();
				seen.set(key, name);
			}
		}
	});
});
