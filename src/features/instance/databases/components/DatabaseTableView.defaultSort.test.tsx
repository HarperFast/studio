/**
 * @vitest-environment jsdom
 */
import { InstanceTable } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseTableView } from './DatabaseTableView';

// No `instanceDatabaseMap`, so the table's describe arrives after the view mounts: the fresh-load
// and deep-link case (#1856). Navigating from the tree finds the table in the map at mount instead.

vi.mock('@tanstack/react-router', () => {
	const params = {};
	const search = {};
	return {
		useParams: () => params,
		useSearch: () => search,
		Link: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	};
});

type Thing = { id: string; name: string };

interface SearchBody {
	operation: string;
	conditions?: { search_attribute: keyof Thing; search_type: string; search_value: string }[];
	sort?: { attribute: keyof Thing; descending: boolean };
	limit?: number;
}

const instance = vi.hoisted(() => ({ searches: [] as SearchBody[] }));

const records: Thing[] = [
	{ id: 't1', name: 'John' },
	{ id: 't2', name: 'Johanna' },
	{ id: 't3', name: 'Bohn' },
];

const byAttribute = (attribute: keyof Thing) => (a: Thing, b: Thing) => a[attribute].localeCompare(b[attribute]);

// As harperdb 4.7.40 answers for `type Thing @table { id: ID @primaryKey name: String @indexed }`: a
// search with no `sort` comes back in the order of the index it was driven from.
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
					return { data: [...records].sort(byAttribute('id')), status: 200 };
				case 'search_by_conditions': {
					instance.searches.push(body);
					const [driving] = body.conditions!;
					const matches = records.filter((record) => record[driving.search_attribute].startsWith(driving.search_value));
					const order = body.sort ? byAttribute(body.sort.attribute) : byAttribute(driving.search_attribute);
					matches.sort(body.sort?.descending ? (a, b) => order(b, a) : order);
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
	URL.createObjectURL ??= () => 'blob:export';
	URL.revokeObjectURL ??= () => undefined;
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	instance.searches = [];
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
const shownIds = () =>
	screen.getAllByRole('cell').map((cell) => cell.textContent).filter((text) => records.some(({ id }) => id === text));

async function filterBy(name: string, value: string) {
	await findCell('t1');
	fireEvent.click(screen.getByRole('button', { name: /show filters/i }));
	fireEvent.change(filterInput(name), { target: { value } });
	fireEvent.keyDown(filterInput(name), { key: 'Enter' });
	await vi.waitFor(() => expect(instance.searches.length).toBeGreaterThan(0));
	await vi.waitFor(() => expect(screen.queryByRole('cell', { name: 't3' })).toBeNull());
}

describe('DatabaseTableView sort on a fresh load', { timeout: 30_000 }, () => {
	it('sorts a filtered list by the primary key that describe reported after mount', async () => {
		renderView();
		await filterBy('name', 'Jo*');

		expect(instance.searches.at(-1)!.sort).toEqual({ attribute: 'id', descending: false });
		await vi.waitFor(() => expect(shownIds()).toEqual(['t1', 't2']));
	});

	it('exports a filtered list in primary-key order', async () => {
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
		renderView();
		await filterBy('name', 'Jo*');

		fireEvent.pointerDown(screen.getByRole('button', { name: /table options/i }), { button: 0, ctrlKey: false });
		fireEvent.click(screen.getByRole('menuitem', { name: 'Export CSV' }));

		await vi.waitFor(() => expect(instance.searches.at(-1)!.limit).toBe(1_000_000));
		expect(instance.searches.at(-1)!.sort).toEqual({ attribute: 'id', descending: false });
	});

	it('keeps the column the user sorted by, in the direction its header shows', async () => {
		renderView();
		await filterBy('name', 'Jo*');
		const nameHeader = () => screen.getByRole('button', { name: 'name' });
		const arrow = () => nameHeader().querySelector('svg')!.classList;

		fireEvent.click(nameHeader());
		await vi.waitFor(() => expect(instance.searches.at(-1)!.sort).toEqual({ attribute: 'name', descending: false }));
		await vi.waitFor(() => expect(shownIds()).toEqual(['t2', 't1']));
		expect(arrow()).toContain('lucide-arrow-up');

		fireEvent.click(nameHeader());
		await vi.waitFor(() => expect(instance.searches.at(-1)!.sort).toEqual({ attribute: 'name', descending: true }));
		await vi.waitFor(() => expect(shownIds()).toEqual(['t1', 't2']));
		expect(arrow()).toContain('lucide-arrow-down');
	});
});
