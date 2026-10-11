/**
 * @vitest-environment jsdom
 */
import { InstanceTable } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RecordNavigation } from '../modals/EditTableRowModal';
import { DatabaseTableView } from './DatabaseTableView';

// The grid, its footer and React Query stay real, so a filtered page reaches the pager the way it
// does in production.

vi.mock('@tanstack/react-router', () => {
	const params = {};
	const search = { filters: { kind: 'cat' } };
	return {
		useParams: () => params,
		useSearch: () => search,
		Link: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	};
});

interface SearchBody {
	operation: string;
	conditions?: { search_attribute: string; search_type: string; search_value: unknown }[];
	offset?: number;
	limit?: number;
}

const instance = vi.hoisted(() => ({
	records: [] as Record<string, unknown>[],
	searches: [] as { offset?: number; limit?: number }[],
}));

// As harperdb 4.7.40 answers: describe_table counts the whole table, and search_by_conditions
// returns a bare array cut by offset/limit, with no count of what matched.
vi.mock('@/config/useInstanceClient', () => {
	const instanceClient = {
		post: async (_url: string, body: SearchBody) => {
			switch (body.operation) {
				case 'describe_table':
					return {
						data: {
							schema: 'data',
							name: 'pets',
							hash_attribute: 'id',
							audit: true,
							schema_defined: false,
							attributes: [
								{ attribute: 'id', is_primary_key: true },
								{ attribute: '__createdtime__', indexed: true },
								{ attribute: '__updatedtime__', indexed: true },
								{ attribute: 'kind', indexed: true },
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
				case 'search_by_conditions': {
					instance.searches.push({ offset: body.offset, limit: body.limit });
					const matches = instance.records.filter((record) =>
						body.conditions!.every((condition) => record[condition.search_attribute] === condition.search_value)
					);
					const offset = body.offset ?? 0;
					return { data: matches.slice(offset, offset + (body.limit ?? matches.length)), status: 200 };
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
// Only what the editor is told about where the open record sits.
const editor = vi.hoisted(() => ({ navigation: undefined as RecordNavigation | undefined }));
vi.mock('../modals/EditTableRowModal', () => ({
	EditTableRowModal: ({ recordNavigation }: { recordNavigation?: RecordNavigation }) => {
		editor.navigation = recordNavigation;
		return null;
	},
}));

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
	instance.searches = [];
	editor.navigation = undefined;
});

function seedPets(count: number, isCat: (id: number) => boolean) {
	instance.records = Array.from({ length: count }, (_, index) => ({
		id: index + 1,
		kind: isCat(index + 1) ? 'cat' : 'dog',
	}));
}

function renderView() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<DatabaseTableView databaseName="data" tableName="pets" />
		</QueryClientProvider>,
	);
}

const nextPage = () => screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement;
// The real grid renders slowly under a loaded test run, well past the one-second default.
const findCell = (name: string) => screen.findByRole('cell', { name }, { timeout: 10_000 });

describe('DatabaseTableView paging a filtered result set', { timeout: 30_000 }, () => {
	it('counts the filtered matches, not the whole table, when they fit on one page', async () => {
		seedPets(45, (id) => id % 3 === 0);
		renderView();

		await findCell('45');
		expect(screen.getByText(/^Page 1/).textContent).toBe('Page 1 of 1');
		expect(nextPage().disabled).toBe(true);
		expect(screen.getByText('15 matching records')).toBeTruthy();
		expect(screen.queryByText(/45 records/)).toBeNull();
		expect(instance.searches).toEqual([{ offset: 0, limit: 21 }]);
	});

	it('pages forward while matches remain and stops on the last page, even an exactly full one', async () => {
		seedPets(120, (id) => id % 2 === 0);
		renderView();

		await findCell('40');
		// The lookahead record is not one of the page's rows.
		expect(screen.queryByRole('cell', { name: '42' })).toBeNull();
		expect(nextPage().disabled).toBe(false);
		expect(screen.getByText(/^Page 1/).textContent).toBe('Page 1');
		expect(screen.getByText('More than 20 matching records')).toBeTruthy();

		fireEvent.click(nextPage());
		await findCell('80');
		fireEvent.click(nextPage());
		await findCell('120');

		// Exactly 20 matches on the last page: no empty fourth page is offered.
		expect(nextPage().disabled).toBe(true);
		expect(screen.getByText(/^Page 3/).textContent).toBe('Page 3 of 3');
		expect(screen.getByText('60 matching records')).toBeTruthy();
		expect(instance.searches).toEqual([
			{ offset: 0, limit: 21 },
			{ offset: 20, limit: 21 },
			{ offset: 40, limit: 21 },
		]);
	});

	it('steps the row editor past a full page only when another page of matches follows', async () => {
		seedPets(40, (id) => id % 2 === 0);
		renderView();

		fireEvent.click(await findCell('40'));
		expect(editor.navigation).toMatchObject({ position: 20, total: 20, isTotalEstimated: false, hasNext: false });

		cleanup();
		seedPets(42, (id) => id % 2 === 0);
		renderView();

		fireEvent.click(await findCell('40'));
		expect(editor.navigation).toMatchObject({ position: 20, total: undefined, hasNext: true });
	});
});
