/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseTableView } from './DatabaseTableView';

// The grid and React Query stay real, so a computed value has to make it from the transport into a
// rendered cell the way it does in production.

vi.mock('@tanstack/react-router', () => {
	const params = {};
	const search = {};
	return {
		useParams: () => params,
		useSearch: () => search,
		Link: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	};
});

type GetAttribute = string | { name: string; select: string[] };

interface Body {
	operation: string;
	include_computed?: boolean;
	get_attributes?: GetAttribute[];
}

const csvRequests = vi.hoisted(() => [] as Body[]);

const stored = [{ id: 'p1', price: 100, taxRate: 0.19 }];
const computed: Record<string, (record: (typeof stored)[number]) => unknown> = {
	totalPrice: (record) => record.price + record.price * record.taxRate,
};

// As harperdb 4.7.40 answers for `totalPrice: Float @computed(from: "price + (price * taxRate)")`:
// describe lists the attribute only when asked with `include_computed`, and a search resolves it only
// when `get_attributes` names it ahead of the '*'. A leading '*' returns what is stored.
vi.mock('@/config/useInstanceClient', () => {
	const instanceClient = {
		post: async (_url: string, body: Body, config?: { headers?: Record<string, string> }) => {
			if (config?.headers?.Accept === 'text/csv') {
				csvRequests.push(body);
				return { data: '', status: 200 };
			}
			switch (body.operation) {
				case 'describe_table':
					return {
						data: {
							schema: 'data',
							name: 'Product2',
							hash_attribute: 'id',
							audit: true,
							schema_defined: true,
							attributes: [
								{ attribute: 'id', type: 'ID', is_primary_key: true },
								{ attribute: 'price', type: 'Float' },
								{ attribute: 'taxRate', type: 'Float' },
								...(body.include_computed ? [{ attribute: 'totalPrice', type: 'Float', computed: true }] : []),
							],
							record_count: stored.length,
						},
						status: 200,
					};
				case 'search_by_value': {
					const select = body.get_attributes ?? ['*'];
					const rows = select[0] === '*' ? stored : stored.map((record) => {
						const row: Record<string, unknown> = {};
						for (const attribute of select) {
							if (attribute === '*') {
								Object.assign(row, record);
							} else if (typeof attribute === 'string') {
								row[attribute] = computed[attribute]?.(record);
							}
						}
						return row;
					});
					return { data: rows, status: 200 };
				}
				case 'registration_info':
					return { data: { version: '4.7.40' }, status: 200 };
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
	csvRequests.length = 0;
});

describe('DatabaseTableView on a table with a @computed attribute', { timeout: 30_000 }, () => {
	it('shows the computed column with its computed value', async () => {
		render(
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<DatabaseTableView databaseName="data" tableName="Product2" />
			</QueryClientProvider>,
		);

		await screen.findByRole('cell', { name: '100' }, { timeout: 10_000 });
		expect(screen.getByRole('columnheader', { name: /totalPrice/ })).toBeTruthy();
		expect(screen.getByRole('cell', { name: '119' })).toBeTruthy();
	});

	it('exports the computed attribute by name, with no * to duplicate it', async () => {
		URL.createObjectURL ??= () => 'blob:export';
		URL.revokeObjectURL ??= () => undefined;
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
		render(
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<DatabaseTableView databaseName="data" tableName="Product2" />
			</QueryClientProvider>,
		);
		await screen.findByRole('cell', { name: '119' }, { timeout: 10_000 });

		fireEvent.pointerDown(screen.getByRole('button', { name: /table options/i }), { button: 0, ctrlKey: false });
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Export CSV' }));

		await waitFor(() => expect(click).toHaveBeenCalled());
		expect(csvRequests.map((body) => [body.operation, body.get_attributes])).toEqual([
			['search_by_value', ['id', 'price', 'taxRate', 'totalPrice']],
		]);
		click.mockRestore();
	});
});
