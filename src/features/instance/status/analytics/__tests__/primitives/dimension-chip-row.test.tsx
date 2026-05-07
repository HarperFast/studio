// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DimensionChipRow } from '../../primitives/DimensionChipRow.tsx';

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

	it('Other chip is non-interactive (aria-disabled, no role=radio, not in roving tab order)', () => {
		render(
			<DimensionChipRow
				dimensionValues={values}
				selected={'/api/users'}
				otherKey="Other"
				onSelect={() => {}}
			/>,
		);
		// Only the selectable values are role=radio.
		const radios = screen.getAllByRole('radio');
		expect(radios.length).toBe(3);
		// The Other chip exists with aria-disabled and tabIndex=-1.
		const chips = screen.getAllByTestId('dimension-chip');
		const otherChip = chips.find((c) => c.getAttribute('data-value') === 'Other');
		expect(otherChip, 'Other chip rendered').toBeTruthy();
		expect(otherChip!.getAttribute('aria-disabled')).toBe('true');
		expect(otherChip!.getAttribute('role')).toBe(null);
		expect((otherChip as HTMLButtonElement).tabIndex).toBe(-1);
	});
});
