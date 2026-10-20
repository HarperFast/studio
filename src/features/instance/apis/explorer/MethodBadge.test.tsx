/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MethodBadge } from './MethodBadge';

afterEach(cleanup);

describe('MethodBadge', () => {
	// `--yellow` text on its own tint is 1.84:1 in light mode; it only reads on the dark surfaces.
	it('sets PUT in amber-800 on the yellow tint, keeping yellow for dark mode', () => {
		render(<MethodBadge method="put" />);
		const classes = Array.from(screen.getByText('put').classList);
		expect(classes).toEqual(expect.arrayContaining(['text-amber-800', 'dark:text-yellow', 'bg-yellow/10']));
		expect(classes).not.toContain('text-yellow');
	});
});
