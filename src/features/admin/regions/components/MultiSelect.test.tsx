/**
 * @vitest-environment jsdom
 */
import { MultiSelect, MultiSelectOption } from '@/features/admin/regions/components/MultiSelect';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

// Radix's menu relies on a handful of DOM APIs that jsdom doesn't implement.
beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	if (typeof window.PointerEvent === 'undefined') {
		window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
	}
});

afterEach(() => cleanup());

const options: MultiSelectOption[] = [
	{ value: 'us-east', label: 'US East' },
	{ value: 'de-fra-2', label: 'Frankfurt' },
	{ value: 'ap-northeast', label: 'Tokyo' },
];

function Harness({ initial = [] as string[], allowRepeats = false }) {
	const [selected, setSelected] = useState<string[]>(initial);
	return (
		<MultiSelect
			options={options}
			selected={selected}
			onChange={setSelected}
			ariaLabel="Locations"
			allowRepeats={allowRepeats}
		/>
	);
}

/** Chip labels in render order — one chip per selected entry, so repeats appear repeatedly. */
function chipLabels() {
	return screen.queryAllByRole('button', { name: /^Remove / }).map((b) => b.getAttribute('aria-label')!.slice(7));
}

function openMenu() {
	fireEvent.pointerDown(screen.getByRole('button', { name: 'Locations' }), { button: 0, ctrlKey: false });
}

describe('MultiSelect', () => {
	// The trigger is only in the a11y tree with the menu closed (Radix hides it while open),
	// so drive the count from a controlled selection rather than mid-interaction.
	it('shows the placeholder when empty and a selected count when populated', () => {
		render(<Harness />);
		expect(screen.getByRole('button', { name: 'Locations' }).textContent).toContain('Select');

		cleanup();
		render(<Harness initial={['us-east', 'ap-northeast']} />);
		expect(screen.getByRole('button', { name: 'Locations' }).textContent).toContain('2 selected');
	});

	it('keeps the menu open across multiple picks', () => {
		render(<Harness />);
		openMenu();
		fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'US East' }));
		// Menu is still open (Radix hides everything outside the portal while open, so we can only
		// assert on in-menu state here), so a second item can be checked without reopening.
		fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Tokyo' }));

		const items = within(screen.getByRole('menu')).getAllByRole('menuitemcheckbox');
		expect(items).toHaveLength(3);
		const checked = items.filter((el) => el.getAttribute('aria-checked') === 'true').map((el) => el.textContent);
		expect(checked).toEqual(['US East', 'Tokyo']);
	});

	it('filters options by label without the Radix typeahead hijacking input', () => {
		render(<Harness />);
		openMenu();
		fireEvent.change(screen.getByRole('textbox', { name: 'Filter options' }), { target: { value: 'frank' } });

		const items = within(screen.getByRole('menu')).getAllByRole('menuitemcheckbox');
		expect(items.map((el) => el.textContent)).toEqual(['Frankfurt']);
	});

	it('renders removable chips for selected values and unselects on remove', () => {
		render(<Harness initial={['us-east']} />);
		const remove = screen.getByRole('button', { name: 'Remove US East' });
		expect(remove).toBeTruthy();

		fireEvent.click(remove);

		expect(screen.queryByRole('button', { name: 'Remove US East' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Locations' }).textContent).toContain('Select');
	});

	describe('allowRepeats', () => {
		it('adds another copy on each menu click instead of unselecting', () => {
			render(<Harness allowRepeats />);
			openMenu();

			fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Tokyo' }));
			fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Tokyo' }));
			fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Tokyo' }));
			// Item stays checked — a click never removes when repeats are allowed.
			expect(screen.getByRole('menuitemcheckbox', { name: 'Tokyo' }).getAttribute('aria-checked')).toBe('true');

			// Menu hides the chips while open; close it to read them back.
			fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
			expect(chipLabels()).toEqual(['Tokyo', 'Tokyo', 'Tokyo']);
		});

		it('renders one chip per entry, preserving click order', () => {
			render(<Harness initial={['ap-northeast', 'us-east', 'ap-northeast']} allowRepeats />);
			expect(chipLabels()).toEqual(['Tokyo', 'US East', 'Tokyo']);
			expect(screen.getByRole('button', { name: 'Locations' }).textContent).toContain('3 selected');
		});

		it('X removes only that copy, leaving the others', () => {
			render(<Harness initial={['ap-northeast', 'us-east', 'ap-northeast']} allowRepeats />);

			// Remove the first Tokyo; the second one and US East survive.
			fireEvent.click(screen.getAllByRole('button', { name: 'Remove Tokyo' })[0]);

			expect(chipLabels()).toEqual(['US East', 'Tokyo']);
		});

		it('removing the last copy unchecks the menu item', () => {
			render(<Harness initial={['ap-northeast']} allowRepeats />);

			fireEvent.click(screen.getByRole('button', { name: 'Remove Tokyo' }));

			expect(chipLabels()).toEqual([]);
			openMenu();
			expect(screen.getByRole('menuitemcheckbox', { name: 'Tokyo' }).getAttribute('aria-checked')).toBe('false');
		});

		it('without allowRepeats a second click still unselects', () => {
			render(<Harness />);
			openMenu();

			fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Tokyo' }));
			fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Tokyo' }));

			expect(screen.getByRole('menuitemcheckbox', { name: 'Tokyo' }).getAttribute('aria-checked')).toBe('false');
		});
	});

	// Options aren't virtualized, so a long list needs a rendered ceiling — but the overflow has to be
	// visible and still reachable, not silently dropped.
	describe('maxVisibleOptions', () => {
		const many = Array.from({ length: 10 }, (_, i) => ({ value: `v-${i}`, label: `Option ${i}` }));

		function renderCapped() {
			render(<MultiSelect options={many} selected={[]} onChange={() => {}} ariaLabel="Many" maxVisibleOptions={3} />);
			fireEvent.pointerDown(screen.getByRole('button', { name: 'Many' }), { button: 0, ctrlKey: false });
		}

		it('renders only the cap and says how many are left', () => {
			renderCapped();

			expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(3);
			expect(screen.getByText('7 more — keep typing to narrow')).toBeTruthy();
		});

		it('the filter reaches an option past the cap', () => {
			renderCapped();

			fireEvent.change(screen.getByRole('textbox', { name: 'Filter options' }), { target: { value: 'Option 9' } });

			expect(screen.getByRole('menuitemcheckbox', { name: 'Option 9' })).toBeTruthy();
			expect(screen.queryByText(/more — keep typing/)).toBeNull();
		});
	});

	// The filter input sits inside the menu, so it has to hand the arrow keys back to Radix (which
	// only moves focus into the list when the keydown target is the content element) while still
	// keeping printable keys out of Radix's typeahead. Blanket stopPropagation made the whole
	// component pointer-only.
	describe('keyboard access', () => {
		function filterInput() {
			return screen.getByRole('textbox', { name: 'Filter options' });
		}

		it('walks from the filter into the list and selects with Enter', () => {
			render(<Harness />);
			openMenu();
			fireEvent.change(filterInput(), { target: { value: 'fra' } });

			const items = screen.getAllByRole('menuitemcheckbox');
			expect(items).toHaveLength(1);

			fireEvent.keyDown(filterInput(), { key: 'ArrowDown' });
			expect(document.activeElement).toBe(items[0]);

			fireEvent.keyDown(items[0], { key: 'Enter' });
			expect(items[0].getAttribute('aria-checked')).toBe('true');

			// Radix aria-hides everything outside the open menu, so the chips are only queryable once
			// Escape has closed it — which is also the only way out of the menu by keyboard.
			fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
			expect(chipLabels()).toEqual(['Frankfurt']);
		});

		it('ArrowUp from the filter lands on the last option', () => {
			render(<Harness />);
			openMenu();

			fireEvent.keyDown(filterInput(), { key: 'ArrowUp' });

			expect(document.activeElement).toBe(screen.getByRole('menuitemcheckbox', { name: 'Tokyo' }));
		});

		it('arrow keys land on a rendered option even when the list is capped', () => {
			const many = Array.from({ length: 10 }, (_, i) => ({ value: `v-${i}`, label: `Option ${i}` }));
			render(<MultiSelect options={many} selected={[]} onChange={() => {}} ariaLabel="Many" maxVisibleOptions={3} />);
			fireEvent.pointerDown(screen.getByRole('button', { name: 'Many' }), { button: 0, ctrlKey: false });

			fireEvent.keyDown(filterInput(), { key: 'ArrowUp' });

			expect(document.activeElement).toBe(screen.getByRole('menuitemcheckbox', { name: 'Option 2' }));
		});

		it('typing stays in the filter instead of triggering Radix typeahead', () => {
			render(<Harness />);
			openMenu();
			const input = filterInput();
			input.focus();

			fireEvent.keyDown(input, { key: 't' });

			expect(document.activeElement).toBe(input);
		});
	});
});
