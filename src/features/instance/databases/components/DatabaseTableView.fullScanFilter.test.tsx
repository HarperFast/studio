/**
 * @vitest-environment jsdom
 */
import { InstanceTable } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

interface SearchBody {
	operation: string;
	conditions?: { search_attribute: string; search_type: string; search_value: unknown }[];
	allowFullScan?: boolean;
}

const instance = vi.hoisted(() => ({ searches: [] as SearchBody[] }));

const records = [
	{ id: 't1', name: 'John', note: 'alpha note' },
	{ id: 't2', name: 'Johanna', note: 'beta' },
	{ id: 't3', name: 'Bohn', note: 'gamma alpha' },
];

// As harperdb 4.7.40 answers for `type Thing @table { id: ID @primaryKey name: String @indexed
// note: String }`: `note` has no index, and a condition on it still runs, by reading every record.
vi.mock('@/config/useInstanceClient', () => {
	const instanceClient = {
		post: async (_url: string, body: SearchBody) => {
			switch (body.operation) {
				case 'describe_table':
					return {
						data: {
							schema: 'data',
							name: 'Thing',
							hash_attribute: 'id',
							audit: true,
							schema_defined: true,
							attributes: [
								{ attribute: 'id', type: 'ID', is_primary_key: true },
								{ attribute: 'name', type: 'String', indexed: {} },
								{ attribute: 'note', type: 'String' },
							],
							db_size: 65536,
							sources: [],
							record_count: records.length,
							table_size: 4096,
							db_audit_size: 4096,
						} satisfies InstanceTable,
						status: 200,
					};
				case 'registration_info':
					return { data: { version: '4.7.40' }, status: 200 };
				case 'search_by_value':
					return { data: records, status: 200 };
				case 'search_by_conditions': {
					instance.searches.push(body);
					const matches = records.filter((record) =>
						body.conditions!.every((condition) =>
							record[condition.search_attribute as keyof typeof record] === condition.search_value
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

const confirm = vi.fn<(message?: string) => boolean>();
beforeEach(() => {
	vi.stubGlobal('confirm', confirm);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	confirm.mockReset();
	instance.searches = [];
	route.search = {};
});

function renderView() {
	return render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
			<DatabaseTableView databaseName="data" tableName="Thing" />
		</QueryClientProvider>,
	);
}

// The real grid renders slowly under a loaded test run, well past the one-second default.
const findCell = (name: string) => screen.findByRole('cell', { name }, { timeout: 10_000 });
const filterInput = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;

async function filterBy(name: string, value: string) {
	await findCell('t1');
	fireEvent.click(screen.getByRole('button', { name: /show filters/i }));
	fireEvent.change(filterInput(name), { target: { value } });
	fireEvent.keyDown(filterInput(name), { key: 'Enter' });
}

describe('DatabaseTableView filtering a column no index covers', { timeout: 30_000 }, () => {
	it('marks the column’s filter as unindexed', async () => {
		renderView();
		await findCell('t1');
		fireEvent.click(screen.getByRole('button', { name: /show filters/i }));
		expect(filterInput('note').placeholder).toBe('not indexed');
		expect(filterInput('name').placeholder).toBe('');
	});

	it('asks first, and runs nothing when the user declines', async () => {
		confirm.mockReturnValue(false);
		renderView();
		await filterBy('note', 'beta');

		expect(confirm).toHaveBeenCalledTimes(1);
		expect(confirm.mock.calls[0][0]).toContain('every record in "Thing"');
		await findCell('t3');
		expect(instance.searches).toEqual([]);
		expect(screen.getByRole('button', { name: /apply filters/i })).toBeTruthy();
	});

	it('runs the search, marked as allowed to scan, once the user agrees', async () => {
		confirm.mockReturnValue(true);
		renderView();
		await filterBy('note', 'beta');

		await vi.waitFor(() => expect(instance.searches).toHaveLength(1));
		expect(instance.searches[0]).toMatchObject({
			conditions: [{ search_attribute: 'note', search_type: 'equals', search_value: 'beta' }],
			allowFullScan: true,
		});
		await findCell('t2');
		expect(screen.queryByRole('cell', { name: 't1' })).toBeNull();
	});

	it('does not ask when an index can answer the filter', async () => {
		renderView();
		await filterBy('name', 'John');

		await vi.waitFor(() => expect(instance.searches).toHaveLength(1));
		expect(confirm).not.toHaveBeenCalled();
		expect(instance.searches[0].allowFullScan).toBeUndefined();
	});

	it('reads *x as ends-with and *x* as contains, and asks before either', async () => {
		confirm.mockReturnValue(true);
		renderView();
		await filterBy('name', '*hn');

		await vi.waitFor(() => expect(instance.searches).toHaveLength(1));
		expect(confirm.mock.calls[0][0]).toContain('"name"');
		expect(instance.searches[0]).toMatchObject({
			conditions: [{ search_attribute: 'name', search_type: 'ends_with', search_value: 'hn' }],
			allowFullScan: true,
		});

		fireEvent.change(filterInput('name'), { target: { value: '*oh*' } });
		fireEvent.keyDown(filterInput('name'), { key: 'Enter' });
		await vi.waitFor(() => expect(instance.searches).toHaveLength(2));
		expect(confirm).toHaveBeenCalledTimes(2);
		expect(instance.searches[1].conditions).toEqual([
			{ search_attribute: 'name', search_type: 'contains', search_value: 'oh' },
		]);
	});

	it('shows the filter syntax for the column’s type on its input', async () => {
		renderView();
		await findCell('t1');
		fireEvent.click(screen.getByRole('button', { name: /show filters/i }));
		expect(filterInput('name').title).toContain('*hn ends with');
		expect(filterInput('note').title).toContain('Not indexed');
	});

	it('asks once for a deep link’s filter, and runs it on yes', async () => {
		route.search = { filters: { note: 'beta' } };
		confirm.mockReturnValue(true);
		renderView();

		await findCell('t2');
		expect(instance.searches).toHaveLength(1);
		expect(instance.searches[0].allowFullScan).toBe(true);
		expect(confirm).toHaveBeenCalledTimes(1);
	});

	it('asks before a deep link’s filter runs too', async () => {
		route.search = { filters: { note: 'beta' } };
		confirm.mockReturnValue(false);
		renderView();

		await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
		await findCell('t3');
		expect(instance.searches).toEqual([]);
		expect(filterInput('note').value).toBe('beta');
		expect(screen.getByRole('button', { name: /apply filters/i })).toBeTruthy();
	});
});
