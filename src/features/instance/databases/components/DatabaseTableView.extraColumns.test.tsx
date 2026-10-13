/**
 * @vitest-environment jsdom
 */
import { InstanceTable } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseTableView } from './DatabaseTableView';

vi.mock('@tanstack/react-router', () => {
	const params = {};
	const search = {};
	return {
		useParams: () => params,
		useSearch: () => search,
		Link: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	};
});

interface SearchBody {
	operation: string;
	table?: string;
	offset?: number;
	limit?: number;
}

const instance = vi.hoisted(() => ({
	tables: {} as Record<string, Record<string, unknown>[]>,
	held: new Map<string, () => void>(),
	holdPages: new Set<string>(),
}));
const pageKey = (table: string | undefined, offset: number) => `${table}@${offset}`;

// As harperdb 4.7.40 answers for `type Thing @table { id: ID @primaryKey name: String @indexed }`:
// describe lists only the declared attributes, and a `'*'` search returns each record as stored,
// undeclared properties included.
vi.mock('@/config/useInstanceClient', () => {
	const instanceClient = {
		post: async (_url: string, body: SearchBody, config?: { responseType?: string }) => {
			switch (body.operation) {
				case 'describe_table':
					return {
						data: {
							schema: 'data',
							name: body.table!,
							hash_attribute: 'id',
							audit: true,
							schema_defined: true,
							attributes: [
								{ attribute: 'id', type: 'ID', is_primary_key: true },
								{ attribute: 'name', type: 'String', indexed: {} },
							],
							db_size: 65536,
							sources: [],
							record_count: instance.tables[body.table!]?.length ?? 0,
							table_size: 4096,
							db_audit_size: 4096,
						} satisfies InstanceTable,
						status: 200,
					};
				case 'registration_info':
					return { data: { version: '4.7.40' }, status: 200 };
				case 'search_by_value': {
					const offset = body.offset ?? 0;
					const key = pageKey(body.table, offset);
					if (instance.holdPages.has(key)) {
						await new Promise<void>((resolve) => instance.held.set(key, resolve));
					}
					const records = instance.tables[body.table!] ?? [];
					const page = records.slice(offset, offset + (body.limit ?? 0));
					return { data: config?.responseType === 'text' ? JSON.stringify(page) : page, status: 200 };
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
	instance.tables = {};
	instance.held.clear();
	instance.holdPages.clear();
});

// The view stays mounted across tables, as it does under the router: only its props change.
function renderView(tableName = 'Thing') {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const view = (name: string) => (
		<QueryClientProvider client={queryClient}>
			<DatabaseTableView databaseName="data" tableName={name} />
		</QueryClientProvider>
	);
	const rendered = render(view(tableName));
	return { switchTable: (name: string) => rendered.rerender(view(name)) };
}

// The real grid renders slowly under a loaded test run, well past the one-second default.
const findCell = (name: string) => screen.findByRole('cell', { name }, { timeout: 10_000 });
const headers = () => screen.getAllByRole('columnheader').map((header) => header.textContent);

describe('DatabaseTableView on records with properties the schema does not declare', { timeout: 30_000 }, () => {
	it('shows a column for each, most common first, after the declared ones', async () => {
		instance.tables.Thing = [
			{ id: 't1', name: 'John' },
			{ id: 't2', name: 'Johanna', color: 'red' },
			{ id: 't3', name: 'Bohn', size: 3, color: 'blue' },
		];
		renderView();

		await findCell('blue');
		expect(headers().filter(Boolean)).toEqual(['id', 'name', 'color', 'size']);
		expect(screen.getByRole('cell', { name: '3' })).toBeTruthy();
	});

	it('keeps them while the next page loads, then shows that page’s own', async () => {
		instance.tables.Thing = Array.from({ length: 25 }, (_, index) =>
			index < 20
				? { id: `t${index + 1}`, name: `n${index + 1}`, color: 'red' }
				: { id: `t${index + 1}`, name: `n${index + 1}`, weight: index });
		instance.holdPages.add(pageKey('Thing', 20));
		renderView();
		await findCell('t1');
		expect(headers()).toContain('color');

		fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
		await vi.waitFor(() => expect(instance.held.has(pageKey('Thing', 20))).toBe(true));
		expect(screen.queryByRole('cell', { name: 't1' })).toBeNull();
		expect(headers()).toContain('color');

		instance.held.get(pageKey('Thing', 20))!();
		await findCell('t21');
		expect(headers()).toContain('weight');
		expect(headers()).not.toContain('color');
	});

	it('drops the last table’s extra columns as soon as another table opens', async () => {
		instance.tables.Thing = [{ id: 't1', name: 'John', color: 'red' }];
		instance.tables.Other = [{ id: 'o1', name: 'Olga', weight: 3 }];
		instance.holdPages.add(pageKey('Other', 0));
		const { switchTable } = renderView();
		await findCell('red');

		switchTable('Other');
		await vi.waitFor(() => expect(instance.held.has(pageKey('Other', 0))).toBe(true));
		expect(headers()).not.toContain('color');

		instance.held.get(pageKey('Other', 0))!();
		await findCell('Olga');
		expect(headers()).toContain('weight');
	});

	it('reads each cell from the record’s own property, whatever its name', async () => {
		instance.tables.Thing = [
			{ id: 't1', name: 'John', 'profile.name': 'Ada', toString: 'own value' },
			{ id: 't2', name: 'Johanna' },
		];
		renderView();

		await findCell('Ada');
		expect(screen.getByRole('cell', { name: 'own value' })).toBeTruthy();
		expect(screen.queryByText(/native code/)).toBeNull();
	});

	// The grid's extra columns describe one page; the file describes every record it holds.
	it('exports a property only a record past the loaded page carries', async () => {
		instance.tables.Thing = Array.from({ length: 25 }, (_, index) => ({
			id: `t${index + 1}`,
			name: `n${index + 1}`,
			...(index === 22 ? { weight: 7 } : { color: 'red' }),
		}));
		const createObjectURL = vi.fn((_blob: Blob) => 'blob:export');
		URL.createObjectURL = createObjectURL;
		URL.revokeObjectURL ??= () => undefined;
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
		renderView();
		await findCell('t1');
		expect(headers()).not.toContain('weight');

		fireEvent.pointerDown(screen.getByRole('button', { name: /table options/i }), { button: 0, ctrlKey: false });
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Export CSV' }));
		await waitFor(() => expect(click).toHaveBeenCalled());
		click.mockRestore();

		const lines = (await createObjectURL.mock.calls[0][0].text()).trimEnd().split('\n');
		expect(lines[0]).toBe('"id","name","color","weight"');
		expect(lines).toHaveLength(26);
		expect(lines[23]).toBe('"t23","n23",,7');
	});
});
