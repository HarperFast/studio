/**
 * @vitest-environment jsdom
 */
import { InstanceTable } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

afterEach(() => {
	cleanup();
	instance.searches = [];
	route.search = {};
});

const scanQuestion = () => screen.queryByRole('alertdialog', { name: /^Scan every record in/ });
const findScanQuestion = () => screen.findByRole('alertdialog', { name: /^Scan every record in/ });
const answer = (name: 'Scan anyway' | 'Cancel') => fireEvent.click(screen.getByRole('button', { name }));

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
		renderView();
		await filterBy('note', 'beta');

		const question = await findScanQuestion();
		expect(question.querySelector('h2')!.textContent).toBe('Scan every record in "Thing"?');
		expect(question.textContent).toContain('this filter on "note"');
		expect(instance.searches).toEqual([]);
		answer('Cancel');

		expect(scanQuestion()).toBeNull();
		await findCell('t3');
		expect(instance.searches).toEqual([]);
		expect(screen.getByRole('button', { name: /apply filters/i })).toBeTruthy();
	});

	it('runs the search, marked as allowed to scan, once the user agrees', async () => {
		renderView();
		await filterBy('note', 'beta');
		await findScanQuestion();
		answer('Scan anyway');

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
		expect(scanQuestion()).toBeNull();
		expect(instance.searches[0].allowFullScan).toBeUndefined();
	});

	it('reads *x as ends-with and *x* as contains, and asks before either', async () => {
		renderView();
		await filterBy('name', '*hn');
		expect((await findScanQuestion()).textContent).toContain('"name"');
		answer('Scan anyway');

		await vi.waitFor(() => expect(instance.searches).toHaveLength(1));
		expect(instance.searches[0]).toMatchObject({
			conditions: [{ search_attribute: 'name', search_type: 'ends_with', search_value: 'hn' }],
			allowFullScan: true,
		});

		fireEvent.change(filterInput('name'), { target: { value: '*oh*' } });
		fireEvent.keyDown(filterInput('name'), { key: 'Enter' });
		await findScanQuestion();
		answer('Scan anyway');
		await vi.waitFor(() => expect(instance.searches).toHaveLength(2));
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
		expect(screen.getByRole('textbox', { name: 'Filter name' })).toBe(filterInput('name'));
	});

	it('shows every kind’s syntax from a toggle next to the filters', async () => {
		renderView();
		await findCell('t1');
		fireEvent.click(screen.getByRole('button', { name: /show filters/i }));
		const toggle = screen.getByRole('button', { name: /filter syntax/i });
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(screen.queryByRole('region', { name: 'Filter syntax' })).toBeNull();

		fireEvent.click(toggle);
		const help = screen.getByRole('region', { name: 'Filter syntax' });
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		for (const line of ['*hn ends with', '*oh* contains', '>5  >=5  <5  <=5', 'true or false']) {
			expect(help.textContent).toContain(line);
		}
	});

	it('asks once for a deep link’s filter, and runs it on yes', async () => {
		route.search = { filters: { note: 'beta' } };
		renderView();
		await findScanQuestion();
		expect(instance.searches).toEqual([]);
		answer('Scan anyway');

		await vi.waitFor(() => expect(instance.searches).toHaveLength(1));
		await findCell('t2');
		expect(instance.searches[0].allowFullScan).toBe(true);
		expect(scanQuestion()).toBeNull();
		await vi.waitFor(() => expect(screen.queryByRole('button', { name: /apply filters/i })).toBeNull());
	});

	it('shows exactly the deep link’s filter once it runs, not one typed before it', async () => {
		const { rerender } = renderView();
		await filterBy('name', 'John');
		await vi.waitFor(() => expect(instance.searches).toHaveLength(1));

		route.search = { filters: { note: 'beta' } };
		rerender(
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<DatabaseTableView databaseName="data" tableName="Thing" />
			</QueryClientProvider>,
		);
		await findScanQuestion();
		answer('Scan anyway');

		await vi.waitFor(() => expect(instance.searches).toHaveLength(2));
		expect(instance.searches[1].conditions).toEqual([
			{ search_attribute: 'note', search_type: 'equals', search_value: 'beta' },
		]);
		await vi.waitFor(() => expect(filterInput('note').value).toBe('beta'));
		expect(filterInput('name').value).toBe('');
		expect(screen.queryByRole('button', { name: /apply filters/i })).toBeNull();
	});

	it('keeps no earlier filter in the inputs when the deep link’s question is declined', async () => {
		const { rerender } = renderView();
		await filterBy('name', 'John');
		await vi.waitFor(() => expect(instance.searches).toHaveLength(1));

		route.search = { filters: { note: 'beta' } };
		rerender(
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<DatabaseTableView databaseName="data" tableName="Thing" />
			</QueryClientProvider>,
		);
		await findScanQuestion();
		answer('Cancel');

		await vi.waitFor(() => expect(filterInput('note').value).toBe('beta'));
		expect(filterInput('name').value).toBe('');
		fireEvent.click(screen.getByRole('button', { name: /apply filters/i }));
		await findScanQuestion();
		answer('Scan anyway');
		await vi.waitFor(() => expect(instance.searches).toHaveLength(2));
		expect(instance.searches[1].conditions).toEqual([
			{ search_attribute: 'note', search_type: 'equals', search_value: 'beta' },
		]);
	});

	// The view stays mounted across deep links, so a yes to one must not apply it to the next.
	it('drops the question for a deep link the user has since left', async () => {
		route.search = { filters: { note: 'beta' } };
		const { rerender } = renderView();
		await findScanQuestion();

		route.search = {};
		rerender(
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<DatabaseTableView databaseName="data" tableName="Thing" />
			</QueryClientProvider>,
		);

		expect(scanQuestion()).toBeNull();
		await findCell('t3');
		expect(instance.searches).toEqual([]);
	});

	it('asks before a deep link’s filter runs too', async () => {
		route.search = { filters: { note: 'beta' } };
		renderView();
		await findScanQuestion();
		fireEvent.keyDown(scanQuestion()!, { key: 'Escape' });

		expect(scanQuestion()).toBeNull();
		await findCell('t3');
		expect(instance.searches).toEqual([]);
		expect(filterInput('note').value).toBe('beta');
		expect(screen.getByRole('button', { name: /apply filters/i })).toBeTruthy();
	});
});
