/**
 * @vitest-environment jsdom
 */
import { InstanceDatabaseMap, InstanceTable } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseTableView } from './DatabaseTableView';

vi.mock('@tanstack/react-router', () => {
	const params = {};
	const search = { filters: { author: '.id a1' } };
	return {
		useParams: () => params,
		useSearch: () => search,
		Link: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	};
});

interface SearchBody {
	operation: string;
	table?: string;
	conditions?: { search_attribute: string | string[]; search_type: string; search_value: unknown }[];
}

const instance = vi.hoisted(() => ({
	searches: [] as SearchBody[],
	releaseComponents: () => {},
}));

function table(name: string, attributes: InstanceTable['attributes']): InstanceTable {
	return {
		schema: 'data',
		name,
		hash_attribute: 'id',
		audit: true,
		schema_defined: true,
		attributes,
		db_size: 65536,
		sources: [],
		record_count: 2,
		table_size: 4096,
		db_audit_size: 4096,
	};
}

// As Harper 5 describes `type Book @table { id: ID @primaryKey authorId: ID @indexed author: Author
// @relationship(from: "authorId") }`: the relationship is runtime-only, so describe leaves it out and
// only the component schema says `author` exists.
const databaseMap: InstanceDatabaseMap = {
	data: {
		Book: table('Book', [
			{ attribute: 'id', type: 'ID', is_primary_key: true },
			{ attribute: 'authorId', type: 'ID', indexed: {} },
		]),
		Author: table('Author', [
			{ attribute: 'id', type: 'ID', is_primary_key: true },
			{ attribute: 'name', type: 'String' },
		]),
	},
};

const books = [
	{ id: 'b1', authorId: 'a1' },
	{ id: 'b2', authorId: 'a2' },
];

vi.mock('@/config/useInstanceClient', () => {
	const instanceClient = {
		post: async (_url: string, body: SearchBody) => {
			switch (body.operation) {
				case 'describe_table':
					return { data: databaseMap.data[body.table!], status: 200 };
				case 'registration_info':
					return { data: { version: '5.1.0' }, status: 200 };
				case 'get_components':
					// Held until the test lets it go, the way a cold deep link lands before the schema files do.
					await new Promise<void>((resolve) => {
						instance.releaseComponents = resolve;
					});
					return {
						data: { name: 'components', entries: [{ name: 'app', entries: [{ name: 'schema.graphql' }] }] },
						status: 200,
					};
				case 'get_component_file':
					return {
						data: {
							message: 'type Author @table { id: ID @primaryKey name: String }\n'
								+ 'type Book @table { id: ID @primaryKey authorId: ID @indexed author: Author @relationship(from: "authorId") }',
						},
						status: 200,
					};
				case 'search_by_value':
					return { data: books, status: 200 };
				case 'search_by_conditions': {
					instance.searches.push(body);
					const matches = books.filter((book) =>
						body.conditions!.every((condition) =>
							book[condition.search_attribute as keyof typeof book] === condition.search_value
						)
					);
					return { data: matches, status: 200 };
				}
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

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	if (typeof window.PointerEvent === 'undefined') {
		window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
	}
});

const confirm = vi.fn<(message?: string) => boolean>(() => true);
beforeEach(() => {
	vi.stubGlobal('confirm', confirm);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	confirm.mockClear();
	instance.searches = [];
});

describe('DatabaseTableView deep-linked filter on a relationship only the component schema declares', {
	timeout: 30_000,
}, () => {
	it('waits for the component schema, then filters by the foreign key without a full-scan warning', async () => {
		render(
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<DatabaseTableView instanceDatabaseMap={databaseMap} databaseName="data" tableName="Book" />
			</QueryClientProvider>,
		);
		// The real grid renders slowly under a loaded test run, well past the one-second default.
		await screen.findByRole('cell', { name: 'b2' }, { timeout: 10_000 });
		expect(instance.searches).toEqual([]);

		instance.releaseComponents();

		await vi.waitFor(() => expect(instance.searches).toHaveLength(1), { timeout: 10_000 });
		expect(instance.searches[0].conditions).toEqual([
			{ search_attribute: 'authorId', search_type: 'equals', search_value: 'a1' },
		]);
		expect(confirm).not.toHaveBeenCalled();
		await screen.findByRole('cell', { name: 'b1' }, { timeout: 10_000 });
		expect(screen.queryByRole('cell', { name: 'b2' })).toBeNull();
	});
});
