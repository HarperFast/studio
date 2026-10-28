import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FULL_VIEWPORT_HEIGHT = /\b100[sdl]?vh\b|\b(?:min-|max-)?h-(?:screen|[sdl]vh)\b/g;

const EXEMPT: { file: string; line: string; why: string }[] = [
	{ file: 'components/ui/dialog.tsx', line: 'max-h-screen', why: 'a modal, drawn above the banner' },
	{ file: 'components/ui/sidebar/Sidebar.tsx', line: 'h-svh', why: 'only the unmounted AppSidebar uses it' },
	{ file: 'features/auth/ClusterInstanceSignIn.tsx', line: "? 'min-h-screen'", why: 'local Studio has no banner' },
];

// A layout sized to the viewport that forgets the banner either hides its bottom edge under it or,
// with the banner's end-of-page spacer, makes every page scroll by the banner's height.
describe('viewport-height layouts', () => {
	it('subtract the notification banner wherever they size to the full viewport', () => {
		const offenders: string[] = [];
		for (const entry of readdirSync(srcDir, { recursive: true, encoding: 'utf8' })) {
			const file = entry.split(path.sep).join('/');
			if (!/\.(tsx?|css)$/.test(file) || /\.test\.tsx?$/.test(file)) {
				continue;
			}
			readFileSync(path.join(srcDir, file), 'utf8').split('\n').forEach((line, index) => {
				// Counted, so a line that sizes two things to the viewport needs the subtraction in both.
				const heights = line.match(FULL_VIEWPORT_HEIGHT)?.length ?? 0;
				const subtractions = line.split('--notification-banner-height').length - 1;
				if (heights > subtractions && !EXEMPT.some((exempt) => file === exempt.file && line.includes(exempt.line))) {
					offenders.push(`${file}:${index + 1}`);
				}
			});
		}
		expect(offenders).toEqual([]);
	});
});
