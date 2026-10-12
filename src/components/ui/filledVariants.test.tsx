/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Badge } from './badge';
import { Button } from './button';

afterEach(cleanup);

const classesOf = (element: Element) => Array.from(element.classList);

// White text fails WCAG AA on `--green` (2.13:1) and on `--destructive` (3.73:1) in both themes, since
// the text sits on the fill rather than the page.
describe('filled positive and destructive variants', () => {
	it('Button puts dark text on the green fill', () => {
		render(<Button variant="positive">Create</Button>);
		const button = classesOf(screen.getByRole('button', { name: 'Create' }));
		expect(button).toEqual(expect.arrayContaining(['bg-green', 'text-black-dark']));
		expect(button).not.toContain('text-white');
	});

	it.each([
		['Button', () => render(<Button variant="destructive">Delete</Button>), () => screen.getByRole('button')],
		['Badge', () => render(<Badge variant="destructive">3</Badge>), () => screen.getByText('3')],
	])('%s puts white text on a red that clears AA, darkening on hover', (_, renderIt, find) => {
		renderIt();
		const classes = classesOf(find());
		expect(classes).toEqual(expect.arrayContaining(['bg-red-600', 'text-white']));
		expect(classes.some((name) => name.endsWith('hover:bg-red-700'))).toBe(true);
		// `--destructive` itself, and any lightened hover of it, is under 4.5:1 against white.
		expect(classes.filter((name) => /(^|:)bg-destructive\b/.test(name))).toEqual([]);
	});
});
