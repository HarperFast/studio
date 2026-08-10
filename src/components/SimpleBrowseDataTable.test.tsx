/**
 * @vitest-environment jsdom
 */
import { ColumnDef } from '@/lib/table';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SimpleBrowseDataTable } from './SimpleBrowseDataTable';

afterEach(() => cleanup());

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
