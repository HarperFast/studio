/**
 * @vitest-environment jsdom
 */
import { InstanceDatabaseMap, InstanceTable } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseTableView } from './DatabaseTableView';

// The grid and React Query stay real here, unlike DatabaseTableView.test.tsx: a query that never
// starts only hangs against a grid that waits for one, so stubbing either side hides it.

vi.mock('@tanstack/react-router', () => {
	const params = {};
	const search = {};
	return {
		useParams: () => params,
		useSearch: () => search,
		Link: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	};
});

const instance = vi.hoisted(() => ({
	describeTable: undefined as unknown,
	operations: [] as string[],
}));

vi.mock('@/config/useInstanceClient', () => {
	const instanceClient = {
		post: async (_url: string, body: { operation: string }) => {
			instance.operations.push(body.operation);
			switch (body.operation) {
				case 'describe_table':
					return { data: instance.describeTable, status: 200 };
				case 'registration_info':
					return { data: { version: '4.7.32' }, status: 200 };
				default:
					return { data: [], status: 200 };
			}
		},
	};
	const params = { entityId: 'instance-1', instanceClient, entityType: 'instance' };
	return { useInstanceClientIdParams: () => params };
});

vi.mock('@/hooks/useAuth', () => ({
	useStaffPermission: () => false,
}));

vi.mock('@/hooks/usePermissions', () => ({
	useInstanceBrowseManagePermission: () => true,
	useInstanceImportDataPermission: () => true,
	useInstanceImportCapabilities: () => ({
		methods: { sample: true, file: true, url: true },
		allowsSource: () => true,
		allowsDestination: () => true,
	}),
	useInstanceSchemaTablePermission: () => true,
	useInstanceTablePutPermission: () => true,
}));

vi.mock('./PickColumnsDropdown', () => ({ PickColumnsDropdown: () => null }));
vi.mock('../modals/EditTableRowModal', () => ({ EditTableRowModal: () => null }));

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
	instance.describeTable = undefined;
	instance.operations = [];
});

// What a 4.7 instance answers for a table a component created with `ensureTable({ attributes: [] })`.
const unkeyedTable = {
	schema: 'data',
	name: 'ws',
	audit: true,
	schema_defined: true,
	attributes: [],
	db_size: 12251136,
	sources: [],
	record_count: 36,
	table_size: 122880,
	db_audit_size: 11837440,
} satisfies InstanceTable;

function renderView(describeTable: InstanceTable) {
	instance.describeTable = describeTable;
	// The page fetches describe_all with `skipRecordCount`, so only describe_table can supply the count.
	const instanceDatabaseMap: InstanceDatabaseMap = { data: { ws: { ...describeTable, record_count: undefined } } };
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<DatabaseTableView databaseName="data" tableName="ws" instanceDatabaseMap={instanceDatabaseMap} />
		</QueryClientProvider>,
	);
}

function openTableOptions() {
	fireEvent.pointerDown(screen.getByRole('button', { name: /table options/i }), { button: 0, ctrlKey: false });
}

describe('DatabaseTableView on a table with no primary key', () => {
	it('settles into an explanation instead of loading forever', async () => {
		const { container } = renderView(unkeyedTable);

		await screen.findByRole('heading', { name: 'ws has no primary key' });
		await screen.findByText(/It reports 36 records/);
		expect(container.querySelector('.animate-spin')).toBeNull();
		expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true);
		expect(instance.operations).not.toContain('search_by_value');
		expect(instance.operations).not.toContain('search_by_conditions');
	});

	it('withdraws the actions that would add or export rows it cannot list', async () => {
		renderView(unkeyedTable);
		await screen.findByRole('heading', { name: 'ws has no primary key' });

		expect(screen.queryByRole('button', { name: /Add New Record/ })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Show Filters' })).toBeNull();
		openTableOptions();
		expect(screen.queryByRole('menuitem', { name: 'Import Data' })).toBeNull();
		expect(screen.getByRole('menuitem', { name: 'Export CSV' }).getAttribute('aria-disabled')).toBe('true');
	});

	it('still lists a table that does declare one, with its actions', async () => {
		renderView({
			...unkeyedTable,
			primary_key: 'id',
			attributes: [{ attribute: 'id', type: 'ID', is_primary_key: true, indexed: true }],
		});

		await waitFor(() => expect(instance.operations).toContain('search_by_value'));
		expect(screen.queryByRole('heading', { name: /no primary key/ })).toBeNull();
		expect(screen.getByRole('button', { name: /Add New Record/ })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Show Filters' })).toBeTruthy();
		openTableOptions();
		expect(screen.getByRole('menuitem', { name: 'Import Data' })).toBeTruthy();
		expect(screen.getByRole('menuitem', { name: 'Export CSV' }).getAttribute('aria-disabled')).toBeNull();
	});
});
