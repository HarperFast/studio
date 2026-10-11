/**
 * @vitest-environment jsdom
 */
import { ColumnDef } from '@/lib/table';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimpleBrowseDataTable } from './SimpleBrowseDataTable';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

interface Pet {
	name: string;
}

const columns: ColumnDef<Pet>[] = [{ header: 'name', accessorKey: 'name', enableSorting: true }];
const data: Pet[] = [{ name: 'zeta' }, { name: 'alpha' }];

function renderedNames() {
	return Array.from(document.querySelectorAll('tbody td')).map((cell) => cell.textContent);
}

describe('SimpleBrowseDataTable', () => {
	it('sorts rows on the client when a sortable header is clicked', () => {
		// v9 sorts only when both the sorting feature and its row model are registered in
		// `studioTableFeatures`; dropping either would silently leave this table unsorted.
		render(<SimpleBrowseDataTable columns={columns} data={data} />);
		expect(renderedNames()).toEqual(['zeta', 'alpha']);

		fireEvent.click(screen.getByRole('button', { name: 'name' }));

		expect(renderedNames()).toEqual(['alpha', 'zeta']);
	});
});

interface Animal {
	name: string;
	kind: string;
	tag: string;
}

const animalColumns: ColumnDef<Animal>[] = [
	{ header: 'Name', accessorKey: 'name', enableSorting: true },
	{ header: 'Kind', accessorKey: 'kind' },
	{ header: 'Tag', accessorKey: 'tag', enableGlobalFilter: false },
];

/** `count` animals named `<prefix>-00`, `<prefix>-01`, ... so the rendered order is checkable. */
function animals(count: number, prefix = 'pet', kind = 'dog'): Animal[] {
	return Array.from({ length: count }, (_, index) => ({
		name: `${prefix}-${String(index).padStart(2, '0')}`,
		kind,
		tag: 'cat',
	}));
}

function renderedAnimalNames() {
	return Array.from(document.querySelectorAll('tbody tr')).map((row) => row.querySelector('td')?.textContent);
}

function filterBox() {
	return screen.getByRole('searchbox', { name: 'Filter animals' });
}

/**
 * TanStack defers its automatic page-index reset to a microtask, so a change is awaited inside `act`
 * before asserting: a reset that should not happen must have had the chance to.
 */
async function settled(change: () => void) {
	await act(async () => change());
}

function typeFilter(text: string) {
	return settled(() => fireEvent.change(filterBox(), { target: { value: text } }));
}

function nextPage() {
	fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
}

describe('SimpleBrowseDataTable opt-in filtering and pagination', () => {
	it('renders every row it is given, with no search box or pager, when the table does not opt in', () => {
		// The client row models are registered on every SimpleBrowseDataTable; only the opt-in props
		// may switch them on. Without `manualPagination` here this table would quietly stop at one page.
		render(<SimpleBrowseDataTable columns={animalColumns} data={animals(45)} />);

		expect(renderedAnimalNames()).toHaveLength(45);
		expect(screen.queryByRole('searchbox')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
	});

	it('filters rows case-insensitively, ignoring a column that opts out of the filter', async () => {
		const rows: Animal[] = [
			{ name: 'Whiskers', kind: 'cat', tag: 'a' },
			{ name: 'Rex', kind: 'dog', tag: 'cat' },
			{ name: 'Catalina', kind: 'parrot', tag: 'b' },
		];
		render(<SimpleBrowseDataTable columns={animalColumns} data={rows} filter={{ label: 'Filter animals' }} />);

		await typeFilter('CAT');

		// Rex's only "cat" is in the opted-out Tag column.
		expect(renderedAnimalNames()).toEqual(['Whiskers', 'Catalina']);

		await typeFilter('nothing like this');
		expect(screen.getByText('No results.')).toBeTruthy();

		await typeFilter('');
		expect(renderedAnimalNames()).toEqual(['Whiskers', 'Rex', 'Catalina']);
	});

	it('pages rows 20 at a time', () => {
		render(<SimpleBrowseDataTable columns={animalColumns} data={animals(25)} paginated />);

		expect(renderedAnimalNames()).toEqual(animals(20).map((animal) => animal.name));
		expect(screen.getByText('25 records')).toBeTruthy();

		nextPage();

		expect(renderedAnimalNames()).toEqual(animals(25).slice(20).map((animal) => animal.name));
	});

	it('leaves the pager out while every row fits on the smallest page', () => {
		render(<SimpleBrowseDataTable columns={animalColumns} data={animals(20)} paginated />);

		expect(renderedAnimalNames()).toHaveLength(20);
		expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
	});

	it('sorts the whole list before cutting it into pages', () => {
		render(<SimpleBrowseDataTable columns={animalColumns} data={animals(25)} paginated />);

		fireEvent.click(screen.getByRole('button', { name: 'Name' }));
		fireEvent.click(screen.getByRole('button', { name: 'Name' }));

		expect(renderedAnimalNames().slice(0, 2)).toEqual(['pet-24', 'pet-23']);
	});

	it('returns to the first page when the rows are re-sorted', () => {
		render(<SimpleBrowseDataTable columns={animalColumns} data={animals(25)} paginated />);
		nextPage();

		fireEvent.click(screen.getByRole('button', { name: 'Name' }));

		expect(renderedAnimalNames()).toEqual(animals(20).map((animal) => animal.name));
	});

	it('returns to the first page when the filter changes, and pages and counts only the matching rows', async () => {
		const consoleError = vi.spyOn(console, 'error');
		const rows = [...animals(25, 'dog', 'dog'), ...animals(22, 'cat', 'cat')];
		render(
			<SimpleBrowseDataTable columns={animalColumns} data={rows} filter={{ label: 'Filter animals' }} paginated />,
		);
		nextPage();
		nextPage();
		expect(renderedAnimalNames()).toEqual(['cat-15', 'cat-16', 'cat-17', 'cat-18', 'cat-19', 'cat-20', 'cat-21']);

		await typeFilter('cat');

		expect(renderedAnimalNames()).toEqual(animals(20, 'cat').map((animal) => animal.name));
		expect(screen.getByText('22 records')).toBeTruthy();

		await typeFilter('cat-0');

		expect(renderedAnimalNames()).toHaveLength(10);
		expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
		expect(consoleError).not.toHaveBeenCalled();
	});

	it('stays on the current page when the data is refreshed', async () => {
		const { rerender } = render(<SimpleBrowseDataTable columns={animalColumns} data={animals(45)} paginated />);
		nextPage();

		// A poll that brings back a changed list hands the table a new array.
		await settled(() => rerender(<SimpleBrowseDataTable columns={animalColumns} data={animals(45)} paginated />));

		expect(renderedAnimalNames()).toEqual(animals(40).slice(20).map((animal) => animal.name));
	});

	it('moves to the new last page when the data shrinks out from under the current one', async () => {
		const { rerender } = render(<SimpleBrowseDataTable columns={animalColumns} data={animals(45)} paginated />);
		nextPage();
		nextPage();
		expect(renderedAnimalNames()).toHaveLength(5);

		await settled(() => rerender(<SimpleBrowseDataTable columns={animalColumns} data={animals(30)} paginated />));

		expect(renderedAnimalNames()).toEqual(animals(30).slice(20).map((animal) => animal.name));
		expect(screen.getByText('30 records')).toBeTruthy();
	});
});
