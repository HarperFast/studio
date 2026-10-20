/**
 * @vitest-environment jsdom
 */
import { InstanceDatabaseMap, InstanceTable } from '@/integrations/api/api.patch';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseActionModals } from './DatabaseActionModals';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', () => {
	const params = {};
	const router = { invalidate: async () => undefined };
	return { useParams: () => params, useNavigate: () => navigate, useRouter: () => router };
});

const describeTable = vi.hoisted(() => vi.fn<(body: Record<string, unknown>) => Promise<{ data: unknown }>>());

vi.mock('@/config/useInstanceClient', () => {
	const instanceClient = {
		post: (_url: string, body: Record<string, unknown>) =>
			body.operation === 'describe_table' ? describeTable(body) : Promise.resolve({ data: {} }),
	};
	const params = { entityId: 'instance-1', instanceClient, entityType: 'instance' };
	return { useInstanceClientIdParams: () => params };
});

const toast = vi.hoisted(() => ({
	loading: vi.fn(() => 'loading-toast'),
	dismiss: vi.fn(),
	error: vi.fn(),
}));
vi.mock('sonner', () => ({ toast }));

vi.mock('@/features/instance/databases/modals/AddTableRowModal', () => ({
	AddTableRowModal: ({ instanceTable }: { instanceTable: InstanceTable }) => (
		<div role="dialog" aria-label={`Add to ${instanceTable.name}`}>
			{instanceTable.attributes.map(({ attribute }) =>
				attribute
			).join(',')}
		</div>
	),
}));
vi.mock('@/features/instance/databases/modals/CreateNewTableModal', () => ({ CreateNewTableModal: () => null }));
const importModal = vi.hoisted(() => ({
	onImported: undefined as undefined | ((databaseName: string, tableName: string) => Promise<void>),
}));
vi.mock('@/features/instance/databases/modals/ImportDataModal', () => ({
	ImportDataModal: ({ onImported }: { onImported: typeof importModal.onImported }) => {
		importModal.onImported = onImported;
		return null;
	},
}));
vi.mock('@/features/instance/databases/modals/DeleteTableModal', () => ({ DeleteTableModal: () => null }));
vi.mock('@/features/instance/databases/modals/DeleteDatabaseModal', () => ({ DeleteDatabaseModal: () => null }));

const table = (name: string, attributes: string[]) => ({
	schema: 'data',
	name,
	hash_attribute: 'id',
	attributes: attributes.map((attribute) => ({ attribute })),
} as InstanceTable);

const instanceDatabaseMap: InstanceDatabaseMap = { data: { Dog: table('Dog', ['id', 'breed']) } };

function AddTarget() {
	const { value } = useWatchedValue('ShowAddTableRecords', false);
	return <output aria-label="add target">{JSON.stringify(value)}</output>;
}

function renderHub() {
	return render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
			<DatabaseActionModals instanceDatabaseMap={instanceDatabaseMap} />
			<AddTarget />
		</QueryClientProvider>,
	);
}

function openAdd(tableName: string) {
	act(() => setWatchedValue('ShowAddTableRecords', { databaseName: 'data', tableName }));
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
}

afterEach(() => {
	act(() => setWatchedValue('ShowAddTableRecords', false));
	cleanup();
	describeTable.mockReset();
	toast.loading.mockClear();
	toast.dismiss.mockClear();
	toast.error.mockClear();
});

describe('DatabaseActionModals opening Add Records', () => {
	it('opens at once, with no describe, for a table the map holds', () => {
		renderHub();
		openAdd('Dog');

		expect(screen.getByRole('dialog', { name: 'Add to Dog' }).textContent).toBe('id,breed');
		expect(describeTable).not.toHaveBeenCalled();
		expect(toast.loading).not.toHaveBeenCalled();
	});

	it('describes a table the map lacks, and opens on the answer', async () => {
		describeTable.mockResolvedValue({ data: table('Cat', ['id', 'name', 'lives']) });
		renderHub();
		openAdd('Cat');

		expect(toast.loading).toHaveBeenCalledWith('Opening "Cat"…');
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(describeTable).toHaveBeenCalledWith(
			expect.objectContaining({ operation: 'describe_table', database: 'data', table: 'Cat', include_computed: true }),
		);

		expect((await screen.findByRole('dialog', { name: 'Add to Cat' })).textContent).toBe('id,name,lives');
		expect(toast.dismiss).toHaveBeenCalledWith('loading-toast');
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('gives up with the server’s reason when the table is gone', async () => {
		describeTable.mockRejectedValue({ response: { status: 404, data: { error: "Table 'data.Gone' does not exist" } } });
		renderHub();
		openAdd('Gone');

		await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
		expect(toast.error).toHaveBeenCalledWith(`Couldn't open "Gone"`, {
			description: "Table 'data.Gone' does not exist",
		});
		expect(toast.dismiss).toHaveBeenCalledWith('loading-toast');
		expect(screen.getByRole('status', { name: 'add target' }).textContent).toBe('false');
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('asks again each time, rather than reopening on an earlier answer', async () => {
		describeTable.mockResolvedValue({ data: table('Cat', ['id']) });
		renderHub();
		openAdd('Cat');
		await screen.findByRole('dialog', { name: 'Add to Cat' });
		act(() => setWatchedValue('ShowAddTableRecords', false));

		const answer = deferred<{ data: unknown }>();
		describeTable.mockReturnValue(answer.promise);
		openAdd('Cat');
		expect(screen.queryByRole('dialog')).toBeNull();

		await act(async () => answer.resolve({ data: table('Cat', ['id', 'name']) }));
		expect(screen.getByRole('dialog', { name: 'Add to Cat' }).textContent).toBe('id,name');
		expect(describeTable).toHaveBeenCalledTimes(2);
	});

	it('ignores the answer to a request another one replaced', async () => {
		const answer = deferred<{ data: unknown }>();
		describeTable.mockReturnValue(answer.promise.then(() => Promise.reject({ message: 'Network Error' })));
		renderHub();
		openAdd('Gone');
		openAdd('Dog');
		expect(toast.dismiss).toHaveBeenCalledWith('loading-toast');

		await act(async () => answer.resolve({ data: undefined }));
		expect(toast.error).not.toHaveBeenCalled();
		expect(screen.getByRole('dialog', { name: 'Add to Dog' })).toBeTruthy();
		expect(screen.getByRole('status', { name: 'add target' }).textContent).toContain('"Dog"');
	});
});

describe('DatabaseActionModals after an import', () => {
	afterEach(() => navigate.mockClear());

	it('goes to the imported table only once describe_all is back, so a table the import created is in the map', async () => {
		const refetched = deferred<object>();
		const tree = vi.fn<() => Promise<object>>().mockResolvedValueOnce(instanceDatabaseMap).mockReturnValueOnce(
			refetched.promise,
		);
		const treeKey = ['instance-1', 'describe_all', true, true];
		function DatabasesPage() {
			useQuery({ queryKey: treeKey, queryFn: tree, staleTime: 60_000 });
			return null;
		}
		const client = new QueryClient();
		render(
			<QueryClientProvider client={client}>
				<DatabasesPage />
				<DatabaseActionModals instanceDatabaseMap={instanceDatabaseMap} />
			</QueryClientProvider>,
		);
		await vi.waitFor(() => expect(client.getQueryData(treeKey)).toBe(instanceDatabaseMap));

		const imported = importModal.onImported!('data', 'Cat');
		await vi.waitFor(() => expect(tree).toHaveBeenCalledTimes(2));
		expect(navigate).not.toHaveBeenCalled();

		await act(async () => {
			refetched.resolve({ data: { ...instanceDatabaseMap.data, Cat: table('Cat', ['id']) } });
			await imported;
		});
		expect(navigate).toHaveBeenCalledTimes(1);
	});
});
