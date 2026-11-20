/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
}));

vi.mock('@/config/useInstanceClient', () => {
	const instanceClient = {
		post: async (_url: string, body: Record<string, unknown>) => {
			server.requests.push(body);
			switch (body.operation) {
				case 'describe_table':
					return {
						data: {
							schema: 'vec',
							name: 'Doc',
							hash_attribute: 'id',
							attributes: [
								{ attribute: 'id', type: 'ID', is_primary_key: true },
								{
									attribute: 'embedding',
									type: 'array',
									elements: 'Float',
									indexed: { type: 'HNSW', distance: 'cosine' },
								},
								{ attribute: 'title', type: 'String' },
							],
							record_count: 1,
						},
					};
				case 'search_by_value':
					if ((body.sort as { target?: unknown } | undefined)?.target) {
						return {
							data: [{ $distance: 0, id: 'b', title: 'kitten' }, { $distance: 0.42, id: 'c', title: 'cat' }],
						};
					}
					return { data: [{ id: 'b', title: 'kitten', embedding: EMBEDDING }] };
				case 'search_by_id':
					return { data: server.stored ? [server.stored] : [] };
				case 'registration_info':
					return { data: { version: '5.4.1' } };
				default:
					return { data: [] };
			}
		},
	};
	const params = { entityId: 'instance-1', instanceClient, entityType: 'instance' };
	return { useInstanceClientIdParams: () => params };
});

vi.mock('@/hooks/useAuth', () => ({ useStaffPermission: () => false }));
vi.mock('@/hooks/useInstanceOperationPermission', () => ({
	useInstanceOperationPermission: () => true,
	useInstanceOperationAccess: () => true,
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
	useInstanceSchemaTableReadDenied: () => false,
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
