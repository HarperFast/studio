// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TableSizeChipRow } from '../../charts/TableSizeChipRow.tsx';
import { OTHER_KEY } from '../../lib/tableSize.ts';

describe('TableSizeChipRow radiogroup (shared roving-tabindex primitive)', () => {
	afterEach(() => cleanup());

	const tables = ['db.dog', 'db.cat', 'db.bird'];

	it('is a single tab stop: only the selected chip has tabIndex=0', () => {
		render(
			<TableSizeChipRow
				tableSet={tables}
				hasOther
				selectedTable="db.cat"
				onSelectTable={() => {}}
			/>,
		);
		const chips = screen.getAllByTestId('table-size-chip');
		expect(chips.length).toBe(4); // 3 tables + Other
		const tabbable = chips.filter((c) => (c as HTMLButtonElement).tabIndex === 0);
		expect(tabbable.length).toBe(1);
		expect(tabbable[0].getAttribute('data-table')).toBe('db.cat');
	});

	it('arrow keys move selection with wrap, skipping the Other chip', () => {
		const picks: string[] = [];
		render(
			<TableSizeChipRow
				tableSet={tables}
				hasOther
				selectedTable="db.bird"
				onSelectTable={(t) => picks.push(t)}
			/>,
		);
		const chips = screen.getAllByTestId('table-size-chip');
		// From the last selectable chip, Right wraps to the first (not Other).
		fireEvent.keyDown(chips[2], { key: 'ArrowRight' });
		expect(picks).toEqual(['db.dog']);
	});

	it('Other chip is a disabled radio: aria-disabled, never checked, tabIndex=-1', () => {
		render(
			<TableSizeChipRow
				tableSet={tables}
				hasOther
				selectedTable="db.dog"
				onSelectTable={() => {}}
			/>,
		);
		const other = screen
			.getAllByTestId('table-size-chip')
			.find((c) => c.getAttribute('data-table') === OTHER_KEY);
		expect(other, 'Other chip rendered').toBeTruthy();
		expect(other!.getAttribute('role')).toBe('radio');
		expect(other!.getAttribute('aria-disabled')).toBe('true');
		expect(other!.getAttribute('aria-checked')).toBe('false');
		expect((other as HTMLButtonElement).tabIndex).toBe(-1);
	});

	it('falls back to the first chip as tab stop when selection is null or Other', () => {
		render(
			<TableSizeChipRow
				tableSet={tables}
				hasOther
				selectedTable={null}
				onSelectTable={() => {}}
			/>,
		);
		const chips = screen.getAllByTestId('table-size-chip');
		expect((chips[0] as HTMLButtonElement).tabIndex).toBe(0);
		expect(chips.filter((c) => (c as HTMLButtonElement).tabIndex === 0).length).toBe(1);
	});
});
