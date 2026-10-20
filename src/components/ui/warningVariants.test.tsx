/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Alert, AlertDescription, AlertTitle } from './alert';
import { Button } from './button';

afterEach(cleanup);

const classesOf = (element: Element) => Array.from(element.classList);

// Amber or yellow text, and white on yellow, fail WCAG AA on these surfaces, so the hue has to live in
// the border, icon and fill.
describe('warning variants', () => {
	it('Alert renders its title and description in the foreground color on an amber tint', () => {
		render(
			<Alert variant="warning">
				<svg />
				<AlertTitle>Title</AlertTitle>
				<AlertDescription>Description</AlertDescription>
			</Alert>,
		);
		const alert = classesOf(screen.getByRole('alert'));
		expect(alert).toEqual(expect.arrayContaining([
			'text-foreground',
			'*:data-[slot=alert-description]:text-foreground',
			'bg-amber-500/10',
			'border-amber-700',
			'dark:border-amber-500',
			'[&>svg]:text-amber-700',
			'dark:[&>svg]:text-amber-400',
		]));
		expect(alert.filter((name) => /^(dark:)?text-amber-/.test(name))).toEqual([]);
		// The base `[&>svg]:text-current` would otherwise win: Tailwind emits it later in the stylesheet.
		expect(alert).not.toContain('[&>svg]:text-current');
	});

	it('Button puts dark text on the yellow fill', () => {
		render(<Button variant="warning">Confirm</Button>);
		const button = classesOf(screen.getByRole('button', { name: 'Confirm' }));
		expect(button).toEqual(expect.arrayContaining(['bg-yellow', 'text-black-dark']));
		expect(button).not.toContain('text-white');
	});
});
