/**
 * @vitest-environment jsdom
 */
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseTableView } from './DatabaseTableView';

const route = vi.hoisted(() => ({ search: {} as { filters?: Record<string, string> } }));

vi.mock('@tanstack/react-router', () => {
	const params = {};
	return {
		useParams: () => params,
		useSearch: () => route.search,
		Link: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	};
});

const EMBEDDING = [0.9, 0.1, 0, 0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];

const server = vi.hoisted(() => ({
	stored: undefined as Record<string, unknown> | undefined,
	requests: [] as Array<Record<string, unknown>>,
	embed: false,
	version: '5.4.1' as string | 'refused' | 'pending',
	noPrimaryKey: false,
	readDenied: false,
	entityId: 'instance-1',
}));

const fixtures = vi.hoisted(() => ({
	describe: (name: string) => ({
		schema: 'vec',
		name,
		...(server.noPrimaryKey ? null : { hash_attribute: 'id' }),
		attributes: [
			{ attribute: 'id', type: 'ID', is_primary_key: !server.noPrimaryKey },
			{
				attribute: 'embedding',
				type: 'array',
				elements: 'Float',
				indexed: { type: 'HNSW', distance: 'cosine' },
				...(server.embed ? { embed: { source: 'title', model: 'default' } } : null),
			},
			{ attribute: 'title', type: 'String' },
		],
		record_count: 1,
	}),
}));

vi.mock('@/config/useInstanceClient', () => {
	const instanceClient = {
		post: async (_url: string, body: Record<string, unknown>) => {
			server.requests.push(body);
			switch (body.operation) {
				case 'describe_table':
					return { data: fixtures.describe(String(body.table)) };
				case 'search_by_value': {
					const sort = body.sort as { target?: unknown; text?: unknown } | undefined;
					if (sort?.target) {
						return {
							data: [{ $distance: 0, id: 'b', title: 'kitten' }, { $distance: 0.42, id: 'c', title: 'cat' }],
						};
					}
					if (sort?.text) {
						return { data: [{ $distance: 0.03, id: 'b', title: 'kitten' }] };
					}
					return { data: [{ id: 'b', title: 'kitten', embedding: EMBEDDING }] };
				}
				case 'search_by_id':
					return { data: server.stored ? [server.stored] : [] };
				case 'registration_info':
					if (server.version === 'pending') {
						return new Promise(() => {});
					}
					if (server.version === 'refused') {
						// How Harper refuses it to a role whose operations allowlist leaves it out.
						const config = { headers: new AxiosHeaders(), method: 'post' } as InternalAxiosRequestConfig;
						throw new AxiosError('Request failed with status code 403', AxiosError.ERR_BAD_REQUEST, config, undefined, {
							status: 403,
							statusText: 'Forbidden',
							headers: {},
							config,
							data: { error: 'This operation is not authorized due to role restrictions' },
						});
					}
					return { data: { version: server.version } };
				default:
					return { data: [] };
			}
		},
	};
	// One stable object per instance, as the app's hook memoizes per mounted view.
	const byEntity = new Map<string, { entityId: string; instanceClient: typeof instanceClient; entityType: string }>();
	return {
		useInstanceClientIdParams: () => {
			if (!byEntity.has(server.entityId)) {
				byEntity.set(server.entityId, { entityId: server.entityId, instanceClient, entityType: 'instance' });
			}
			return byEntity.get(server.entityId)!;
		},
	};
});

vi.mock('@/hooks/useAuth', () => ({
	useStaffPermission: () => false,
	useInstanceAuth: () => ({ user: { role: { permission: { super_user: true } } } }),
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
	useInstanceSchemaTableReadDenied: () => server.readDenied,
	useInstanceTablePutPermission: () => true,
}));
vi.mock('./PickColumnsDropdown', () => ({ PickColumnsDropdown: () => null }));
vi.mock('../modals/EditTableRowModal', () => ({
	EditTableRowModal: ({ isModalOpen, data, onFindSimilar }: {
		isModalOpen: boolean;
		data?: unknown[];
		onFindSimilar?: () => void;
	}) =>
		isModalOpen && data
			? (
				<div role="region" aria-label="Record editor">
					{onFindSimilar && <button onClick={onFindSimilar}>Find Similar</button>}
				</div>
			)
			: null,
}));

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	server.requests = [];
	server.embed = false;
	server.version = '5.4.1';
	server.noPrimaryKey = false;
	server.readDenied = false;
	server.entityId = 'instance-1';
	route.search = {};
});

async function openTheRecord() {
	render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
			<DatabaseTableView databaseName="vec" tableName="Doc" />
		</QueryClientProvider>,
	);
	const cell = await screen.findByRole('cell', { name: '10 numbers: [0.9, 0.1, 0, …]' }, { timeout: 10_000 });
	await act(async () => {
		fireEvent.click(cell);
	});
	return screen.findByRole('region', { name: 'Record editor' });
}

describe('DatabaseTableView similar records', { timeout: 30_000 }, () => {
	it('searches from the stored record’s vector, and lists the others with their distance', async () => {
		server.stored = { id: 'b', title: 'kitten', embedding: EMBEDDING };
		const editor = await openTheRecord();
		await act(async () => {
			fireEvent.click(within(editor).getByRole('button', { name: 'Find Similar' }));
		});
		const dialog = await screen.findByRole('dialog', { name: 'Similar records' });
		expect(await within(dialog).findByText('distance 0.42')).toBeTruthy();
		expect(within(dialog).queryByText('kitten')).toBeNull();
		expect(server.requests.filter(request => (request.sort as { target?: unknown } | undefined)?.target))
			.toEqual([expect.objectContaining({
				search_attribute: 'id',
				get_attributes: ['$distance', 'id', 'title'],
				sort: { attribute: 'embedding', target: EMBEDDING },
			})]);
	});

	it('offers no Find Similar for a row nothing is stored under, though the grid shows a vector for it', async () => {
		server.stored = undefined;
		const editor = await openTheRecord();
		expect(within(editor).queryByRole('button', { name: 'Find Similar' })).toBeNull();
	});

	it('offers no Find Similar when the stored record has no vector', async () => {
		server.stored = { id: 'b', title: 'kitten' };
		const editor = await openTheRecord();
		expect(within(editor).queryByRole('button', { name: 'Find Similar' })).toBeNull();
	});
});

describe('DatabaseTableView deep-linked vector filter', { timeout: 30_000 }, () => {
	it('says a vector can’t be filtered, and sends no search Harper would refuse', async () => {
		const toastError = vi.spyOn(toast, 'error');
		route.search = { filters: { embedding: '0.9' } };
		render(
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<DatabaseTableView databaseName="vec" tableName="Doc" />
			</QueryClientProvider>,
		);
		await vi.waitFor(() =>
			expect(toastError).toHaveBeenCalledWith(
				"embedding is a vector, which can't be filtered",
				expect.objectContaining({ description: expect.stringContaining('Find Similar') }),
			), { timeout: 10_000 });
		expect(server.requests.some(request => request.operation === 'search_by_conditions')).toBe(false);
	});
});

describe('DatabaseTableView vector search by text', { timeout: 30_000 }, () => {
	const vectorSearchButton = () => screen.queryByRole('button', { name: /Vector Search/ });

	async function renderTable(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
		render(
			<QueryClientProvider client={client}>
				<DatabaseTableView databaseName="vec" tableName="Doc" />
			</QueryClientProvider>,
		);
		await vi.waitFor(() => {
			expect(server.requests.some(request => request.operation === 'describe_table')).toBe(true);
			expect(server.requests.some(request => request.operation === 'registration_info')).toBe(true);
		}, { timeout: 10_000 });
		await act(() => new Promise(resolve => setTimeout(resolve, 50)));
	}

	it('searches an @embed field by text on Harper 5.4.2, from the toolbar, only on submit', async () => {
		server.embed = true;
		server.version = '5.4.2';
		await renderTable();
		await act(async () => fireEvent.click(await screen.findByRole('button', { name: /Vector Search/ })));
		const dialog = await screen.findByRole('dialog', { name: 'Vector search' });
		fireEvent.change(within(dialog).getByLabelText('Text'), { target: { value: 'my kitten' } });
		const textSearches = () => server.requests.filter(request => (request.sort as { text?: unknown })?.text);
		expect(textSearches()).toEqual([]);
		await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: /Search/ })));
		expect(await within(dialog).findByText('distance 0.03')).toBeTruthy();
		expect(textSearches()).toEqual([expect.objectContaining({
			operation: 'search_by_value',
			search_attribute: 'id',
			sort: { attribute: 'embedding', text: 'my kitten' },
		})]);
	});

	it.each([
		['another table', () => ({ tableName: 'Other' })],
		['the same table on another instance', () => {
			server.entityId = 'instance-2';
			return { tableName: 'Doc' };
		}],
	])('keeps no search by text when the view moves to %s', async (_, move) => {
		server.embed = true;
		server.version = '5.4.2';
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		// The database map already holds both tables, as it does in the app once Browse has loaded, so the
		// view keeps a schema, and its dialog stays mounted, across the move.
		const map = {
			vec: { Doc: fixtures.describe('Doc'), Other: fixtures.describe('Other') },
		} as unknown as InstanceDatabaseMap;
		const view = (tableName: string) => (
			<QueryClientProvider client={client}>
				<DatabaseTableView databaseName="vec" tableName={tableName} instanceDatabaseMap={map} />
			</QueryClientProvider>
		);
		const { rerender } = render(view('Doc'));
		await act(async () =>
			fireEvent.click(await screen.findByRole('button', { name: /Vector Search/ }, { timeout: 10_000 }))
		);
		const dialog = await screen.findByRole('dialog', { name: 'Vector search' });
		fireEvent.change(within(dialog).getByLabelText('Text'), { target: { value: 'my kitten' } });
		await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: /Search/ })));
		await within(dialog).findByText('distance 0.03');
		// The app's route change closes it; this test's router mock has no params to change.
		await act(async () => fireEvent.keyDown(dialog, { key: 'Escape' }));

		rerender(view(move().tableName));
		await act(async () =>
			fireEvent.click(await screen.findByRole('button', { name: /Vector Search/ }, { timeout: 10_000 }))
		);
		const reopened = await screen.findByRole('dialog', { name: 'Vector search' });
		expect((within(reopened).getByLabelText('Text') as HTMLInputElement).value).toBe('');
		expect(within(reopened).queryByRole('region', { name: 'Results' })).toBeNull();
	});

	it('is offered at once when Harper won’t tell its version, with no retries first', async () => {
		server.embed = true;
		server.version = 'refused';
		// The app's own retry policy, which would retry a refusal for seconds without the version probe's.
		await renderTable(new QueryClient());
		expect(await screen.findByRole('button', { name: /Vector Search/ }, { timeout: 500 })).toBeTruthy();
		expect(server.requests.filter(request => request.operation === 'registration_info')).toHaveLength(1);
	});

	it.each([
		['the version is still being read', { embed: true, version: 'pending' }],
		['Harper predates 5.4.2', { embed: true, version: '5.4.1' }],
		['no vector field has @embed', { embed: false, version: '5.4.2' }],
		['the table has no primary key', { embed: true, version: '5.4.2', noPrimaryKey: true }],
		['this role can’t read the table', { embed: true, version: '5.4.2', readDenied: true }],
	])('is not offered when %s', async (_, state) => {
		Object.assign(server, state);
		await renderTable();
		expect(vectorSearchButton()).toBeNull();
	});
});
