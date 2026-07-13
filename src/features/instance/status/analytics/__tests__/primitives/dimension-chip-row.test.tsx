// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DimensionChipRow } from '../../primitives/DimensionChipRow';

describe('DimensionChipRow primitive', () => {
	afterEach(() => cleanup());

	const values = ['/api/users', '/api/orders', '/api/products'];

	it('renders chips with role=radio + aria-checked + tabIndex roving', () => {
		render(
			<DimensionChipRow
				dimensionValues={values}
				selected={'/api/orders'}
				onSelect={() => {}}
			/>,
		);
		const chips = screen.getAllByRole('radio');
		expect(chips.length).toBe(3);
		// aria-checked tracks selection.
		expect(chips[0].getAttribute('aria-checked')).toBe('false');
		expect(chips[1].getAttribute('aria-checked')).toBe('true');
		expect(chips[2].getAttribute('aria-checked')).toBe('false');
		// tabIndex follows selection (roving tabindex).
		expect(chips[0].tabIndex).toBe(-1);
		expect(chips[1].tabIndex).toBe(0);
		expect(chips[2].tabIndex).toBe(-1);
	});

	it('Right arrow moves selection to next chip; wraps at end', () => {
		const picks: string[] = [];
		render(
			<DimensionChipRow
				dimensionValues={values}
				selected={'/api/products'}
				onSelect={(v) => picks.push(v)}
			/>,
		);
		const chips = screen.getAllByRole('radio');
		fireEvent.keyDown(chips[2], { key: 'ArrowRight' });
		// Wraps to first chip.
		expect(picks[0]).toBe('/api/users');
	});

	it('Left arrow wraps at start', () => {
		const picks: string[] = [];
		render(
			<DimensionChipRow
				dimensionValues={values}
				selected={'/api/users'}
				onSelect={(v) => picks.push(v)}
			/>,
		);
		const chips = screen.getAllByRole('radio');
		fireEvent.keyDown(chips[0], { key: 'ArrowLeft' });
		// Wraps to last chip.
		expect(picks[0]).toBe('/api/products');
	});

	it('Enter/Space selects focused chip via onSelect callback', () => {
		const picks: string[] = [];
		render(
			<DimensionChipRow
				dimensionValues={values}
				selected={'/api/users'}
				onSelect={(v) => picks.push(v)}
			/>,
		);
		const chips = screen.getAllByRole('radio');
		fireEvent.keyDown(chips[1], { key: 'Enter' });
		fireEvent.keyDown(chips[2], { key: ' ' });
		expect(picks).toEqual(['/api/orders', '/api/products']);
	});

	it('Other chip is a disabled radio (aria-disabled, never checked, not in roving tab order)', () => {
		const picks: string[] = [];
		render(
			<DimensionChipRow
				dimensionValues={values}
				selected={'/api/users'}
				otherKey="Other"
				onSelect={(v) => picks.push(v)}
			/>,
		);
		// The Other chip participates in the group as a perceivable, disabled radio.
		const radios = screen.getAllByRole('radio');
		expect(radios.length).toBe(4);
		const chips = screen.getAllByTestId('dimension-chip');
		const otherChip = chips.find((c) => c.getAttribute('data-value') === 'Other');
		expect(otherChip, 'Other chip rendered').toBeTruthy();
		expect(otherChip!.getAttribute('role')).toBe('radio');
		expect(otherChip!.getAttribute('aria-disabled')).toBe('true');
		expect(otherChip!.getAttribute('aria-checked')).toBe('false');
		expect((otherChip as HTMLButtonElement).tabIndex).toBe(-1);
		// Arrow keys never land on it: from the last selectable chip, Right
		// wraps to the first selectable chip.
		fireEvent.keyDown(chips[2], { key: 'ArrowRight' });
		expect(picks).toEqual(['/api/users']);
	});

	it('the group is a single tab stop (exactly one chip with tabIndex=0), even with Other', () => {
		render(
			<DimensionChipRow
				dimensionValues={values}
				selected={'/api/orders'}
				otherKey="Other"
				onSelect={() => {}}
			/>,
		);
		const chips = screen.getAllByTestId('dimension-chip');
		const tabbable = chips.filter((c) => (c as HTMLButtonElement).tabIndex === 0);
		expect(tabbable.length).toBe(1);
		expect(tabbable[0].getAttribute('data-value')).toBe('/api/orders');
	});
});
