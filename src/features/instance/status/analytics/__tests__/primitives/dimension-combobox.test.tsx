// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { DimensionCombobox } from '../../primitives/DimensionCombobox.tsx';

function Harness(props: { values: readonly string[]; initial: string; otherKey?: string }) {
	const [sel, setSel] = useState(props.initial);
	return (
		<DimensionCombobox
			dimensionValues={props.values}
			selected={sel}
			onSelect={setSel}
			otherKey={props.otherKey}
			ariaLabel="Path"
		/>
	);
}

// WAI-ARIA APG button-pattern combobox: the popup-trigger is a <button> with
// aria-haspopup='listbox' (NOT role='combobox'); when open, the searchbox
// inside the popup is the actual role='combobox' with aria-activedescendant
// driving option highlight. Tests target the trigger by its aria-label —
// which composes the current selection into the accessible name — and the
// searchbox by role='combobox' (only present while open).
function getTrigger() {
	return screen.getByRole('button', { name: /^Path/ });
}

describe('DimensionCombobox primitive', () => {
	afterEach(() => cleanup());

	it('renders a button trigger with the selected value as label', () => {
		const values = ['/a', '/b', '/c'];
		render(<Harness values={values} initial="/b" />);
		const trigger = getTrigger();
		expect(trigger.textContent ?? '').toMatch(/\/b/);
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
	});

	it('trigger accessible name contains the current selection (and tracks it)', () => {
		const values = ['/users', '/orders', '/health'];
		render(<Harness values={values} initial="/users" />);
		// aria-label composes label + selection so SR users hear the value.
		expect(screen.getByRole('button', { name: 'Path: /users' })).toBeTruthy();
		fireEvent.click(getTrigger());
		const input = screen.getByRole('combobox') as HTMLInputElement;
		fireEvent.change(input, { target: { value: 'ord' } });
		fireEvent.keyDown(input, { key: 'Enter' });
		expect(screen.getByRole('button', { name: 'Path: /orders' })).toBeTruthy();
	});

	it('opens the listbox on click; Escape closes', () => {
		const values = ['/a', '/b', '/c'];
		render(<Harness values={values} initial="/a" />);
		const trigger = getTrigger();
		fireEvent.click(trigger);
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(screen.getByRole('listbox')).toBeTruthy();
		// While open, the input is role='combobox' (the actual ARIA combobox).
		const input = screen.getByRole('combobox');
		fireEvent.keyDown(input, { key: 'Escape' });
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
	});

	it('typing filters the list; Enter on the only remaining option selects it', () => {
		const values = ['/users', '/orders', '/health'];
		render(<Harness values={values} initial="/users" />);
		fireEvent.click(getTrigger());
		const input = screen.getByRole('combobox') as HTMLInputElement;
		fireEvent.change(input, { target: { value: 'ord' } });
		const opts = screen.getAllByRole('option');
		expect(opts.length).toBe(1);
		expect(opts[0].textContent ?? '').toMatch(/\/orders/);
		// aria-activedescendant points at the active option.
		expect(input.getAttribute('aria-activedescendant')).toBe(opts[0].id);
		fireEvent.keyDown(input, { key: 'Enter' });
		expect(getTrigger().textContent ?? '').toMatch(/\/orders/);
	});

	it('renders a non-interactive Other chip when otherKey provided', () => {
		render(<Harness values={['/a', '/b']} initial="/a" otherKey="Other" />);
		fireEvent.click(getTrigger());
		// The Other chip text shouldn't be inside an <li role='option'>.
		const otherText = screen.getByText(/Other \(aggregate; not selectable\)/);
		expect(otherText.closest('[role="option"]')).toBe(null);
	});

	it('"No matches" lives outside the listbox as a role=status announcement', () => {
		render(<Harness values={['/a', '/b']} initial="/a" />);
		fireEvent.click(getTrigger());
		const input = screen.getByRole('combobox') as HTMLInputElement;
		fireEvent.change(input, { target: { value: 'zzz' } });
		const status = screen.getByText(/No matches/);
		// Not inside the listbox (would announce as a selectable option otherwise).
		expect(status.closest('[role="listbox"]')).toBe(null);
		expect(status.getAttribute('role')).toBe('status');
		// Empty filtered → aria-activedescendant is empty string (not a stale id).
		expect(input.getAttribute('aria-activedescendant')).toBe('');
	});

	it('aria-activedescendant resets to first option as filter narrows the list', () => {
		render(<Harness values={['/users', '/orders', '/health']} initial="/users" />);
		fireEvent.click(getTrigger());
		const input = screen.getByRole('combobox') as HTMLInputElement;
		// Move active to second option.
		fireEvent.keyDown(input, { key: 'ArrowDown' });
		const beforeFilter = input.getAttribute('aria-activedescendant');
		expect(beforeFilter).toBeTruthy();
		// Filter to one match — activeIdx should reset to 0.
		fireEvent.change(input, { target: { value: 'ord' } });
		const opts = screen.getAllByRole('option');
		expect(opts.length).toBe(1);
		expect(input.getAttribute('aria-activedescendant')).toBe(opts[0].id);
	});
});
