/**
 * @vitest-environment jsdom
 */
import { formatBrowseDataTableHeader } from '@/features/instance/databases/functions/formatBrowseDataTableHeader';
import { ColumnVisibilityState } from '@tanstack/react-table';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PickColumnsDropdown } from './PickColumnsDropdown';

// Radix's menu relies on a handful of DOM APIs that jsdom doesn't implement.
beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	if (typeof window.PointerEvent === 'undefined') {
		// Radix opens the menu on pointerdown; jsdom has no PointerEvent, so back
		// it with MouseEvent (which carries the `button` field Radix checks).
		window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
	}
});

afterEach(() => cleanup());

const columns = [{ header: 'id' }, { header: 'name' }, { header: 'email' }] as ReturnType<
	typeof formatBrowseDataTableHeader
>['dataTableColumns'];

function Harness({ initial = {} as ColumnVisibilityState }) {
	const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(initial);
	return (
		<PickColumnsDropdown
			columns={columns}
			columnVisibility={columnVisibility}
			setColumnVisibility={setColumnVisibility}
		/>
	);
}

function openMenu() {
	fireEvent.pointerDown(screen.getByRole('button', { name: /columns/i }), { button: 0, ctrlKey: false });
}

function checkboxItems() {
	return screen.getAllByRole('menuitemcheckbox');
}

function isDisabled(el: HTMLElement) {
	return el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('data-disabled');
}

describe('PickColumnsDropdown', () => {
	it('offers Select all and Deselect all actions alongside the columns', () => {
		render(<Harness />);
		openMenu();
		expect(screen.getByRole('menuitem', { name: 'Select all' })).toBeTruthy();
		expect(screen.getByRole('menuitem', { name: 'Deselect all' })).toBeTruthy();
		expect(checkboxItems().map(el => el.textContent)).toEqual(['id', 'name', 'email']);
	});

	it('Deselect all hides every column in one click', () => {
		render(<Harness />);
		openMenu();
		// All columns start visible (default when unset).
		expect(checkboxItems().every(el => el.getAttribute('aria-checked') === 'true')).toBe(true);

		fireEvent.click(screen.getByRole('menuitem', { name: 'Deselect all' }));

		expect(checkboxItems().every(el => el.getAttribute('aria-checked') === 'false')).toBe(true);
	});

	it('Select all shows every column in one click', () => {
		render(<Harness initial={{ id: false, name: false, email: false }} />);
		openMenu();
		expect(checkboxItems().every(el => el.getAttribute('aria-checked') === 'false')).toBe(true);

		fireEvent.click(screen.getByRole('menuitem', { name: 'Select all' }));

		expect(checkboxItems().every(el => el.getAttribute('aria-checked') === 'true')).toBe(true);
	});

	it('disables Select all when all visible and Deselect all when none visible', () => {
		render(<Harness />);
		openMenu();
		// Everything visible: nothing more to select.
		expect(isDisabled(screen.getByRole('menuitem', { name: 'Select all' }))).toBe(true);
		expect(isDisabled(screen.getByRole('menuitem', { name: 'Deselect all' }))).toBe(false);

		fireEvent.click(screen.getByRole('menuitem', { name: 'Deselect all' }));

		// Nothing visible: nothing more to deselect.
		expect(isDisabled(screen.getByRole('menuitem', { name: 'Select all' }))).toBe(false);
		expect(isDisabled(screen.getByRole('menuitem', { name: 'Deselect all' }))).toBe(true);
	});

	it('keeps the menu open after a bulk action so columns can be refined', () => {
		render(<Harness />);
		openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Deselect all' }));
		// The menu (and its checkbox items) are still on screen.
		expect(within(screen.getByRole('menu')).getAllByRole('menuitemcheckbox')).toHaveLength(3);
	});
});
