/**
 * @vitest-environment jsdom
 */
import { InstanceDatabaseMap, InstanceTable } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseTableView } from './DatabaseTableView';
import type { TableRowSelection } from './TableView';

// The dropdown's own permission gate is the thing under test; every other permission hook just
// needs a fixed answer so the toolbar around it renders without pulling in the auth store/router.
const permissionState = vi.hoisted(() => ({
	canManageBrowseInstance: true,
	canImportFromFile: true,
	allowedSources: ['csv-data', 'csv-url', 'json-records'] as string[],
	canDeleteRecords: true,
}));

vi.mock('@tanstack/react-router', () => {
	// Stable references: the component keys effects off these objects' identity, and the real
	// router hooks only produce a new one when params/search actually change.
	const params = {};
	const search = {};
	return {
		useParams: () => params,
		useSearch: () => search,
		Link: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	};
});

vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ entityId: 'instance-1', instanceClient: {}, entityType: 'instance' }),
}));

vi.mock('@/hooks/useAuth', () => ({
	useStaffPermission: () => false,
}));

vi.mock('@/hooks/usePermissions', () => ({
	useInstanceBrowseManagePermission: () => permissionState.canManageBrowseInstance,
	useInstanceImportDataPermission: () => true,
	useInstanceImportCapabilities: () => ({
		methods: { sample: true, file: permissionState.canImportFromFile, url: true },
		allowsSource: (kind: string) => permissionState.allowedSources.includes(kind),
		allowsDestination: () => true,
	}),
	useInstanceSchemaTablePermission: (_entityId: string, _database: string, _table: string, action: string) =>
		action === 'delete' ? permissionState.canDeleteRecords : true,
	useInstanceTablePutPermission: () => true,
}));

// The empty state fires its launches through the watcher; capture them without replacing the module
// (`useWatchedValue` is still read elsewhere in this tree).
const watchedValues = vi.hoisted(() => ({ calls: [] as [string, unknown][] }));

vi.mock('@/lib/events/watcher', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/events/watcher')>();
	return {
		...actual,
		setWatchedValue: (key: string, value: unknown) => {
			watchedValues.calls.push([key, value]);
		},
	};
});

// The grid and row editor aren't what this file pins -- swap them for stubs so a render doesn't
// need real table data or a Radix Dialog. TableView's stub keeps its props, so a test can still
// show the grid was built from the schema this render actually had.
const tableViewColumns = vi.hoisted(() => ({ current: [] as { accessorKey?: string }[] }));
// The stub also hands back the selection wiring, so a test can tick rows the way the real grid
// would and then assert on the toolbar the selection drives.
const tableViewSelection = vi.hoisted(() => ({
	current: undefined as TableRowSelection | undefined,
}));

// Only the component is stubbed: `rowSelectionKey` is the real helper deciding which rows this
// component can address, and the derived-selection tests below turn on it behaving as shipped.
vi.mock('./TableView', async (importOriginal) => ({
	...await importOriginal<typeof import('./TableView')>(),
	TableView: ({ columns, emptyState, rowSelection }: {
		columns: { accessorKey?: string }[];
		emptyState?: React.ReactNode;
		rowSelection?: TableRowSelection;
	}) => {
		tableViewColumns.current = columns;
		tableViewSelection.current = rowSelection;
		// Rendering the slot is what lets a test follow a card click through to the launch it fires.
		return <>{emptyState}</>;
	},
}));

// Only the mutation hook is stubbed: `describeIncompleteDelete` is the real thing under test when a
// response comes back partial or unreadable, so it must stay the module's own implementation.
const deleteRecords = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('@/integrations/api/instance/database/deleteTableRecords', async (importOriginal) => ({
	...await importOriginal<typeof import('@/integrations/api/instance/database/deleteTableRecords')>(),
	useDeleteTableRecords: () => ({ mutate: deleteRecords.mutate, isPending: false }),
}));
vi.mock('./PickColumnsDropdown', () => ({ PickColumnsDropdown: () => null }));
vi.mock('../modals/EditTableRowModal', () => ({ EditTableRowModal: () => null }));

// describe_table is the table's own schema fetch; every other query this component reads is
// irrelevant to the menu and comes back empty. Matching by queryKey (rather than mocking each
// `get*QueryOptions` builder) keeps the real gating logic -- which reads `instanceDatabaseMap`
// straight from props -- exercised as written.
const describeTableData = vi.hoisted(() => ({ current: undefined as InstanceTable | undefined }));
// The rows the grid is showing. Selection is DERIVED from these, so a test can move a checked row
// off the page the way an invalidation or a focus refetch does.
const pageRows = vi.hoisted(() => ({ current: [] as Record<string, unknown>[] }));

vi.mock('@tanstack/react-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/react-query')>();
	return {
		...actual,
		useQuery: (options: { queryKey: readonly unknown[] }) =>
			options.queryKey.includes('describe_table')
				? { data: describeTableData.current, isFetching: false, isError: false }
				: options.queryKey.includes('search_by_value')
				? { data: { data: pageRows.current }, isFetching: false, isError: false }
				: { data: undefined, isFetching: false, isError: false, refetch: vi.fn() },
	};
});

// Radix's dropdown opens on pointerdown and probes pointer-capture APIs jsdom doesn't implement.
beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	if (typeof window.PointerEvent === 'undefined') {
		window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
	}
});

afterEach(() => {
	cleanup();
	permissionState.canManageBrowseInstance = true;
	permissionState.canImportFromFile = true;
	permissionState.allowedSources = ['csv-data', 'csv-url', 'json-records'];
	permissionState.canDeleteRecords = true;
	tableViewColumns.current = [];
	tableViewSelection.current = undefined;
	pageRows.current = [];
	watchedValues.calls = [];
	deleteRecords.mutate.mockReset();
	vi.restoreAllMocks();
});

const dogTable = {
	attributes: [{ attribute: 'id', type: 'string', is_primary_key: true, indexed: true }],
	primary_key: 'id',
} as unknown as InstanceTable;

function renderView(
	{ instanceDatabaseMap, rows }: { instanceDatabaseMap?: InstanceDatabaseMap; rows?: Record<string, unknown>[] } = {},
) {
	describeTableData.current = dogTable;
	pageRows.current = rows ?? [{ id: 'abc' }, { id: 'def' }, { id: 1 }, { id: 2 }, { id: 3 }, { id: 'a' }, { id: 'b' }];
	const queryClient = new QueryClient();
	return render(
		<QueryClientProvider client={queryClient}>
			<DatabaseTableView databaseName="data" tableName="dog" instanceDatabaseMap={instanceDatabaseMap} />
		</QueryClientProvider>,
	);
}

function openTableOptions() {
	fireEvent.pointerDown(screen.getByRole('button', { name: /table options/i }), { button: 0, ctrlKey: false });
}

const exportCsvItem = () => screen.queryByRole('menuitem', { name: 'Export CSV' });
const importDataItem = () => screen.queryByRole('menuitem', { name: 'Import Data' });
const dropTableItem = () => screen.queryByRole('menuitem', { name: 'Drop Table' });
const dropDatabaseItem = () => screen.queryByRole('menuitem', { name: 'Drop Database' });

function isDisabled(el: HTMLElement) {
	return el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('data-disabled');
}

describe('DatabaseTableView table options menu', () => {
	// Both actions live in the menu at every width -- no toolbar button duplicates them, and no
	// width-conditional class hides either entry. No Tailwind runs under jsdom, so the width classes
	// are asserted by name rather than by computed visibility.
	it('offers Import Data and Export CSV only as menu entries, at every width', () => {
		renderView();

		expect(screen.queryByRole('button', { name: 'Import Data' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Export CSV' })).toBeNull();

		openTableOptions();

		for (const item of [importDataItem()!, exportCsvItem()!]) {
			expect(item).not.toBeNull();
			expect([...item.classList].filter((name) => /(^|:)hidden$/.test(name))).toEqual([]);
		}
	});

	// `describe_all` (the map) can be slower or unreachable for a role whose allowlist grants
	// describe_table + search but not describe_all -- the trigger must not gate on it, or Export
	// CSV becomes unreachable for that role.
	it('is not disabled and offers Export CSV and Import Data while the database map is absent', () => {
		renderView({ instanceDatabaseMap: undefined });

		const trigger = screen.getByRole('button', { name: /table options/i });
		expect(trigger.hasAttribute('disabled')).toBe(false);

		openTableOptions();

		expect(exportCsvItem()).not.toBeNull();
		expect(isDisabled(exportCsvItem()!.closest('[role="menuitem"]')!)).toBe(false);
		expect(importDataItem()).not.toBeNull();

		// The grid came up from describe_table on its own, so this is a table the user can read and
		// therefore expects to be able to export -- not a half-loaded view.
		expect(tableViewColumns.current.map(({ accessorKey }) => accessorKey)).toContain('id');
	});

	// Whether another table would remain is something only the map can answer, so Drop Table waits
	// for it. Drop Database never needed the map -- it acts on the database named by the route.
	it('withholds Drop Table but keeps Drop Database while the database map is absent', () => {
		renderView({ instanceDatabaseMap: undefined });

		openTableOptions();

		expect(dropTableItem()).toBeNull();
		expect(dropDatabaseItem()).not.toBeNull();
	});

	// A resolved map that doesn't list this database is just as uninformative as no map at all --
	// counting its (zero) tables would otherwise read as "not the last one".
	it('withholds Drop Table when the map resolved without this database', () => {
		renderView({ instanceDatabaseMap: { other: { cat: {} } } as never });

		openTableOptions();

		expect(dropTableItem()).toBeNull();
	});

	it('offers Drop Table and Drop Database once the map resolves, for a role that can manage', () => {
		renderView({ instanceDatabaseMap: { data: { dog: {}, cat: {} } } as never });

		openTableOptions();

		expect(dropTableItem()).not.toBeNull();
		expect(dropDatabaseItem()).not.toBeNull();
	});

	it('offers neither drop entry to a role that cannot manage', () => {
		permissionState.canManageBrowseInstance = false;
		renderView({ instanceDatabaseMap: { data: { dog: {}, cat: {} } } as never });

		openTableOptions();

		expect(dropTableItem()).toBeNull();
		expect(dropDatabaseItem()).toBeNull();
		expect(exportCsvItem()).not.toBeNull();
	});

	// Dropping the last table in a database is really dropping the database, so that entry alone
	// covers it -- Drop Table would leave nothing to drop.
	it('offers only Drop Database when this is the only table in the database', () => {
		renderView({ instanceDatabaseMap: { data: { dog: {} } } as never });

		openTableOptions();

		expect(dropTableItem()).toBeNull();
		expect(dropDatabaseItem()).not.toBeNull();
	});
});

describe('DatabaseTableView empty state', () => {
	const importCard = () => screen.getByRole('button', { name: /Import your data/ });
	const seedCard = () => screen.getByRole('button', { name: /Seed some data/ });
	const launches = () => watchedValues.calls.filter(([key]) => key === 'ShowImportData').map(([, value]) => value);

	it('launches the import modal on a file import from the Import card', () => {
		renderView();
		fireEvent.click(importCard());
		expect(launches()).toEqual([{ databaseName: 'data', tableName: 'dog', method: 'file' }]);
	});

	it('falls back to the URL method when files are not a granted source', () => {
		permissionState.canImportFromFile = false;
		renderView();
		fireEvent.click(importCard());
		expect(launches()).toEqual([{ databaseName: 'data', tableName: 'dog', method: 'url' }]);
	});

	it('launches the same modal on sample data from the Seed card', () => {
		renderView();
		fireEvent.click(seedCard());
		expect(launches()).toEqual([{ databaseName: 'data', tableName: 'dog', method: 'sample' }]);
	});

	// `dogTable` is primary-key only, so random records have nothing to model. With bundled datasets
	// denied too, Seed would open a dropdown with nothing in it -- an insert-only role's dead end.
	it('withholds Seed when no dataset and no random records are available', () => {
		permissionState.allowedSources = ['json-records'];
		renderView();
		expect(screen.queryByRole('button', { name: /Seed some data/ })).toBeNull();
		expect(screen.getByRole('button', { name: /Import your data/ })).toBeTruthy();
	});
});

describe('DatabaseTableView bulk delete', () => {
	const deleteSelectedButton = () => screen.queryByRole('button', { name: /Delete Selected/ });

	function selectRecords(keys: unknown[]) {
		// Drive the real selection state through the grid's own callbacks rather than setting it
		// from outside, so the toolbar is reacting to what a user ticking checkboxes produces.
		for (const key of keys) {
			act(() => tableViewSelection.current!.toggleRow(key));
		}
	}

	it('offers nothing until a row is selected, then names how many', () => {
		renderView();
		expect(deleteSelectedButton()).toBeNull();

		selectRecords(['abc']);

		expect(deleteSelectedButton()!.textContent).toContain('Delete Selected (1)');
		// The danger border is the whole point of the variant; tailwind-merge would have dropped it
		// if the button had been given a conflicting one.
		expect(deleteSelectedButton()!.classList.contains('border-destructive')).toBe(true);

		selectRecords(['def']);

		expect(deleteSelectedButton()!.textContent).toContain('Delete Selected (2)');
	});

	it('deletes every selected key once confirmed, then clears the selection', () => {
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		renderView();
		selectRecords(['abc', 'def']);

		fireEvent.click(deleteSelectedButton()!);

		expect(deleteRecords.mutate).toHaveBeenCalledTimes(1);
		const [payload, handlers] = deleteRecords.mutate.mock.calls[0];
		// Raw primary-key values, not stringified row ids -- `delete` addresses records by the value
		// stored under the primary key.
		expect(payload).toMatchObject({ databaseName: 'data', tableName: 'dog', hashValues: ['abc', 'def'] });

		act(() => handlers.onSuccess({}));

		expect(deleteSelectedButton()).toBeNull();
	});

	it('does not delete anything when the confirmation is declined', () => {
		vi.spyOn(window, 'confirm').mockReturnValue(false);
		renderView();
		selectRecords(['abc']);

		fireEvent.click(deleteSelectedButton()!);

		expect(deleteRecords.mutate).not.toHaveBeenCalled();
		// The selection survives a declined confirmation -- the user backed out of the delete, not
		// out of the rows they had picked.
		expect(deleteSelectedButton()!.textContent).toContain('Delete Selected (1)');
	});

	it('withholds the selection column from a role that cannot delete records', () => {
		permissionState.canDeleteRecords = false;
		renderView();
		expect(tableViewSelection.current).toBeUndefined();
	});
});

describe('DatabaseTableView selection scope', () => {
	const deleteSelectedButton = () => screen.queryByRole('button', { name: /Delete Selected/ });

	it('arms the delete with every key the grid reports as selectable', () => {
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		renderView();

		// Select-all hands the grid's page keys straight through, so the delete is aimed at the same
		// rows the header checkbox claimed to tick.
		act(() => tableViewSelection.current!.toggleAll([1, 2, 3], true));
		expect(deleteSelectedButton()!.textContent).toContain('Delete Selected (3)');

		fireEvent.click(deleteSelectedButton()!);

		expect(deleteRecords.mutate.mock.calls[0][0]).toMatchObject({ hashValues: [1, 2, 3] });

		act(() => tableViewSelection.current!.toggleAll([1, 2, 3], false));
		expect(deleteSelectedButton()).toBeNull();
	});

	it('drops the selection when the grid is refreshed', () => {
		// A refetch is the one moment the rows behind the checked keys can change without any query
		// parameter moving, so a selection that survived it would describe rows nobody has looked at.
		renderView();
		act(() => tableViewSelection.current!.toggleRow('abc'));
		expect(deleteSelectedButton()).not.toBeNull();

		fireEvent.click(screen.getByRole('button', { name: 'Refresh table' }));

		expect(deleteSelectedButton()).toBeNull();
	});

	it('reports a delete the server only partly applied instead of claiming success', () => {
		// `delete` answers 200 while naming the records it couldn't address. Reporting that as a clean
		// success is what #1643 was about on the update path.
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		const warned = vi.spyOn(toast, 'error').mockImplementation(() => '');
		const succeeded = vi.spyOn(toast, 'success').mockImplementation(() => '');
		renderView();
		act(() => tableViewSelection.current!.toggleAll(['a', 'b'], true));

		fireEvent.click(deleteSelectedButton()!);
		act(() => deleteRecords.mutate.mock.calls[0][1].onSuccess({ deleted_hashes: ['a'], skipped_hashes: ['b'] }));

		expect(succeeded).not.toHaveBeenCalled();
		expect(warned.mock.calls[0][1]).toMatchObject({ description: expect.stringContaining('deleted 1 of 2') });
	});

	it('treats an unreadable delete answer as unproven rather than successful', () => {
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		const warned = vi.spyOn(toast, 'error').mockImplementation(() => '');
		const succeeded = vi.spyOn(toast, 'success').mockImplementation(() => '');
		renderView();
		act(() => tableViewSelection.current!.toggleRow('a'));

		fireEvent.click(deleteSelectedButton()!);
		// Present but not an array: that responder does answer `delete`, and its answer is unreadable.
		act(() => deleteRecords.mutate.mock.calls[0][1].onSuccess({ skipped_hashes: null }));

		expect(succeeded).not.toHaveBeenCalled();
		expect(warned).toHaveBeenCalled();
	});
});

describe('DatabaseTableView selection follows the rows on screen', () => {
	const deleteSelectedButton = () => screen.queryByRole('button', { name: /Delete Selected/ });

	it('disarms a selected row that leaves the page without any query parameter changing', () => {
		// Adding a record invalidates this same list query, and React Query refetches on window focus
		// (no `defaultOptions` are registered, so that default is live). Either can swap the rows while
		// the epoch — entity, page, sort, filters, cache mode — is unchanged, so neither the epoch
		// reset nor `refreshTable` fires. Without deriving the selection from the rows actually shown,
		// "Delete Selected" stays armed for a record the user can no longer see.
		const { rerender } = renderView({ rows: [{ id: 'abc' }, { id: 'def' }] });
		act(() => tableViewSelection.current!.toggleRow('abc'));
		expect(deleteSelectedButton()!.textContent).toContain('Delete Selected (1)');

		pageRows.current = [{ id: 'def' }, { id: 'ghi' }];
		rerender(
			<QueryClientProvider client={new QueryClient()}>
				<DatabaseTableView databaseName="data" tableName="dog" />
			</QueryClientProvider>,
		);

		expect(deleteSelectedButton()).toBeNull();
	});

	it('deletes only the keys still on the page', () => {
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		const { rerender } = renderView({ rows: [{ id: 'abc' }, { id: 'def' }] });
		act(() => tableViewSelection.current!.toggleAll(['abc', 'def'], true));
		expect(deleteSelectedButton()!.textContent).toContain('Delete Selected (2)');

		pageRows.current = [{ id: 'def' }];
		rerender(
			<QueryClientProvider client={new QueryClient()}>
				<DatabaseTableView databaseName="data" tableName="dog" />
			</QueryClientProvider>,
		);
		expect(deleteSelectedButton()!.textContent).toContain('Delete Selected (1)');

		fireEvent.click(deleteSelectedButton()!);

		// 'abc' is still in the stored set, but it is no longer a row anyone can see.
		expect(deleteRecords.mutate.mock.calls[0][0]).toMatchObject({ hashValues: ['def'] });
	});

	it('will not arm a delete for a row that only inherits its primary key', () => {
		// A primary key named `constructor` on a row that doesn't carry it resolves to the inherited
		// function unless the lookup is own-property guarded.
		describeTableData.current = {
			attributes: [{ attribute: 'constructor', type: 'string', is_primary_key: true, indexed: true }],
			primary_key: 'constructor',
		} as unknown as InstanceTable;
		pageRows.current = [{ other: 'inherits-only' }];
		render(
			<QueryClientProvider client={new QueryClient()}>
				<DatabaseTableView databaseName="data" tableName="dog" />
			</QueryClientProvider>,
		);

		act(() => tableViewSelection.current!.toggleRow(Object.prototype.constructor));

		expect(deleteSelectedButton()).toBeNull();
	});
});
