import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TYPE_PALETTE } from '../lib/colorAllocators/typeColors.ts';
import { NODE_PALETTE } from '../lib/nodeColors.ts';
import { OTHER_COLOR, TABLE_PALETTE } from '../lib/tableColors.ts';

// The palettes are now CSS custom properties (`var(--chart-…)`), so the
// disjointness invariant is enforced against their definitions in
// src/index.css rather than against literal hex in the TS modules.
const cssPath = new URL('../../../../../index.css', import.meta.url);
const css = readFileSync(cssPath, 'utf8');

/** All `--name: value;` declarations in the stylesheet, keyed by var name.
 *  The categorical palettes are defined once in :root (shared by light and
 *  dark), so a flat scan is sufficient; if a palette var were ever
 *  re-declared per theme this collapses to the last definition and the
 *  disjointness check below should be widened to per-scope parsing. */
function cssVarDefinitions(): Map<string, string> {
	const defs = new Map<string, string>();
	for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
		defs.set(m[1], m[2].trim().toLowerCase());
	}
	return defs;
}

/** Resolve a palette entry like `var(--chart-node-1)` to its CSS value. */
function resolve(entry: string, defs: Map<string, string>): string {
	const m = entry.match(/^var\((--[\w-]+)\)$/);
	expect(m, `palette entry "${entry}" must be a bare var(--…) reference`).toBeTruthy();
	const value = defs.get(m![1]);
	expect(value, `${m![1]} must be defined in src/index.css`).toBeDefined();
	return value!;
}

describe('categorical palettes', () => {
	it('every palette entry references a var defined in src/index.css', () => {
		const defs = cssVarDefinitions();
		for (const entry of [...NODE_PALETTE, ...TABLE_PALETTE, ...TYPE_PALETTE, OTHER_COLOR]) {
			const value = resolve(entry, defs);
			expect(value, `${entry} should resolve to a 6-digit hex color`).toMatch(/^#[0-9a-f]{6}$/);
		}
	});

	it('node, table, and type palettes are pairwise disjoint', () => {
		const defs = cssVarDefinitions();
		const palettes = { NODE_PALETTE, TABLE_PALETTE, TYPE_PALETTE };
		const seen = new Map<string, string>();
		for (const [name, palette] of Object.entries(palettes)) {
			for (const entry of palette) {
				const key = resolve(entry, defs);
				expect(seen.get(key), `${key} (${entry}) appears in both ${seen.get(key)} and ${name}`).toBeUndefined();
				seen.set(key, name);
			}
		}
	});
});
