/**
 * @vitest-environment jsdom
 */
import { InstanceTable } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseTableView } from './DatabaseTableView';

// The grid and React Query stay real, so a property the schema doesn't declare has to reach a
// rendered column the way it does in production.

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
	offset?: number;
	limit?: number;
}

const instance = vi.hoisted(() => ({
	records: [] as Record<string, unknown>[],
	// Pages held back until the test releases them, keyed by offset.
	held: new Map<number, () => void>(),
	holdOffsets: new Set<number>(),
}));

// As harperdb 4.7.40 answers for `type Thing @table { id: ID @primaryKey name: String @indexed }`:
// describe lists only the declared attributes, and a `'*'` search returns each record as stored,
// undeclared properties included.
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
							record_count: instance.records.length,
							table_size: 4096,
							db_audit_size: 4096,
						} satisfies InstanceTable,
						status: 200,
					};
				case 'registration_info':
					return { data: { version: '4.7.40' }, status: 200 };
				case 'search_by_value': {
					const offset = body.offset ?? 0;
					if (instance.holdOffsets.has(offset)) {
						await new Promise<void>((resolve) => instance.held.set(offset, resolve));
					}
					return { data: instance.records.slice(offset, offset + (body.limit ?? 0)), status: 200 };
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
	instance.records = [];
	instance.held.clear();
	instance.holdOffsets.clear();
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
const headers = () => screen.getAllByRole('columnheader').map((header) => header.textContent);

describe('DatabaseTableView on records with properties the schema does not declare', { timeout: 30_000 }, () => {
	it('shows a column for each, most common first, after the declared ones', async () => {
		instance.records = [
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
		instance.records = Array.from({ length: 25 }, (_, index) =>
			index < 20
				? { id: `t${index + 1}`, name: `n${index + 1}`, color: 'red' }
				: { id: `t${index + 1}`, name: `n${index + 1}`, weight: index });
		instance.holdOffsets.add(20);
		renderView();
		await findCell('t1');
		expect(headers()).toContain('color');

		fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
		await vi.waitFor(() => expect(instance.held.has(20)).toBe(true));
		expect(screen.queryByRole('cell', { name: 't1' })).toBeNull();
		expect(headers()).toContain('color');

		instance.held.get(20)!();
		await findCell('t21');
		expect(headers()).toContain('weight');
		expect(headers()).not.toContain('color');
	});
});
