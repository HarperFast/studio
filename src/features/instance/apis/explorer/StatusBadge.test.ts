import { httpStatusColorClass } from '@/features/instance/apis/explorer/StatusBadge';
import { describe, expect, it } from 'vitest';

describe('httpStatusColorClass', () => {
	it('maps each HTTP status class to its tint, at the boundaries', () => {
		expect(httpStatusColorClass(200)).toContain('text-green');
		expect(httpStatusColorClass(299)).toContain('text-green');
		expect(httpStatusColorClass(300)).toContain('text-blue');
		expect(httpStatusColorClass(399)).toContain('text-blue');
		expect(httpStatusColorClass(400)).toContain('bg-yellow/10');
		expect(httpStatusColorClass(499)).toContain('bg-yellow/10');
		expect(httpStatusColorClass(500)).toContain('text-red');
	});

	it('treats a 0 / non-finite "no response" as red', () => {
		expect(httpStatusColorClass(0)).toContain('text-red');
		expect(httpStatusColorClass(Number.NaN)).toContain('text-red');
	});

	// `--yellow` text on its own tint is 1.84:1 in light mode; it only reads on the dark surfaces.
	it('sets 4xx text in amber-800, keeping yellow for dark mode', () => {
		const classes = httpStatusColorClass(404).split(/\s+/);
		expect(classes).toEqual(expect.arrayContaining(['text-amber-800', 'dark:text-yellow']));
		expect(classes).not.toContain('text-yellow');
	});
});
