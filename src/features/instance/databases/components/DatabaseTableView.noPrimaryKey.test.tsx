/**
 * @vitest-environment jsdom
 */
import { InstanceDatabaseMap, InstanceTable } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseTableView } from './DatabaseTableView';

// Unlike DatabaseTableView.test.tsx, the grid and React Query are real here: the bug is the two of
// them disagreeing -- the view never enabling a list query, and the grid reading "no data" as "rows
// still in flight" -- so stubbing either side would hide it.

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
	const instanceDatabaseMap: InstanceDatabaseMap = { data: { ws: describeTable } };
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<DatabaseTableView databaseName="data" tableName="ws" instanceDatabaseMap={instanceDatabaseMap} />
		</QueryClientProvider>,
	);
}

describe('DatabaseTableView on a table with no primary key', () => {
	it('settles into an explanation instead of loading forever', async () => {
		const { container } = renderView(unkeyedTable);

		await waitFor(() => expect(instance.operations).toContain('describe_table'));
		await screen.findByRole('heading', { name: 'ws has no primary key' });
		expect(container.querySelector('.animate-spin')).toBeNull();
		// The count describe_table carried still describes the table, even though no page can.
		expect(screen.getByText(/It reports 36 records/)).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true);
		expect(instance.operations).not.toContain('search_by_value');
		expect(instance.operations).not.toContain('search_by_conditions');
	});

	it('still lists a table that does declare one', async () => {
		renderView({
			...unkeyedTable,
			primary_key: 'id',
			attributes: [{ attribute: 'id', type: 'ID', is_primary_key: true, indexed: true }],
		});

		await waitFor(() => expect(instance.operations).toContain('search_by_value'));
		expect(screen.queryByRole('heading', { name: /no primary key/ })).toBeNull();
	});
});
