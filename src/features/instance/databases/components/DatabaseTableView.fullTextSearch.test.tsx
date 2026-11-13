/**
 * @vitest-environment jsdom
 */
import { FullTextIndexDescription } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseTableView } from './DatabaseTableView';

// The table view against a real React Query, with only the transport stubbed: the search tester is
// offered exactly when `describe_table` lists a full-text index, which only Harper 5.3+ does.

vi.mock('@tanstack/react-router', () => {
	const params = {};
	const search = {};
	return {
		useParams: () => params,
		useSearch: () => search,
		Link: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	};
});

const server = vi.hoisted(() => ({
	fullTextIndexes: undefined as FullTextIndexDescription[] | undefined,
	describes: 0,
}));

vi.mock('@/config/useInstanceClient', () => {
	const instanceClient = {
		post: async (_url: string, body: { operation: string }) => {
			switch (body.operation) {
				case 'describe_table':
					server.describes++;
					return {
						data: {
							schema: 'data',
							name: 'Product',
							hash_attribute: 'id',
							audit: true,
							schema_defined: true,
							attributes: [{ attribute: 'id', type: 'ID', is_primary_key: true }, {
								attribute: 'title',
								type: 'String',
							}],
							record_count: 1,
							...(server.fullTextIndexes ? { full_text_indexes: server.fullTextIndexes } : null),
						},
					};
				case 'search_by_value':
					return { data: [{ id: 'p1', title: 'Trail shoes' }] };
				case 'registration_info':
					return { data: { version: '5.3.6' } };
				default:
					return { data: [] };
			}
		},
	};
	const params = { entityId: 'instance-1', instanceClient, entityType: 'instance' };
	return { useInstanceClientIdParams: () => params };
});

vi.mock('@/hooks/useAuth', () => ({
	useStaffPermission: () => false,
	useInstanceAuth: () => ({ user: { role: { permission: { super_user: true } } } }),
}));
vi.mock('@/hooks/usePermissions', () => ({
	useInstanceBrowseManagePermission: () => true,
	useInstanceSchemaTableReadDenied: () => false,
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

const INDEX: FullTextIndexDescription = {
	name: 'catalogSearch',
	fields: [{ name: 'title', weight: 1 }],
	analyzer: 'english@2',
	stop_words: true,
	positions: true,
	surface_terms: true,
	synonyms: [],
	highlighting: false,
	query_modes: ['any', 'all', 'fuzzy', 'phrase', 'prefix', 'fuzzy-prefix'],
	readiness: { state: 'ready', owner_epoch: '1', rebuild_attempts: 0 },
};

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(() => {
	cleanup();
	server.fullTextIndexes = undefined;
	server.describes = 0;
});

async function renderTable() {
	render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
			<DatabaseTableView databaseName="data" tableName="Product" />
		</QueryClientProvider>,
	);
	await screen.findByRole('cell', { name: 'Trail shoes' }, { timeout: 10_000 });
}

describe('DatabaseTableView full-text search', { timeout: 30_000 }, () => {
	it('offers no search tester for a table without a full-text index (or a Harper before 5.3)', async () => {
		await renderTable();
		expect(screen.queryByRole('button', { name: /Full-text Search/ })).toBeNull();
	});

	it('opens the tester for a table with one, reading readiness afresh', async () => {
		server.fullTextIndexes = [INDEX];
		await renderTable();
		const describesBefore = server.describes;
		await act(async () => {
			fireEvent.click(await screen.findByRole('button', { name: /Full-text Search/ }));
		});
		expect(screen.getByRole('dialog', { name: 'Full-text search' })).toBeTruthy();
		expect(screen.getByRole('region', { name: 'Index readiness' }).textContent).toContain('catalogSearch');
		expect(server.describes).toBeGreaterThan(describesBefore);
	});
});
