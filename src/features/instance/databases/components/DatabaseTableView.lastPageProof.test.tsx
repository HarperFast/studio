/**
 * @vitest-environment jsdom
 */
import { InstanceTable } from '@/integrations/api/api.patch';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordNavigation } from '../modals/EditTableRowModal';
import { DatabaseTableView } from './DatabaseTableView';

// The grid and React Query stay real: what retires the proof is a refetch React Query decides to
// make, so a stubbed query would decide it for the test.

vi.mock('@tanstack/react-router', () => {
	const params = {};
	const search = {};
	return {
		useParams: () => params,
		useSearch: () => search,
		Link: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	};
});

const instance = vi.hoisted(() => ({
	records: [] as Record<string, unknown>[],
	pageReads: [] as number[],
	failingOffset: undefined as number | undefined,
	heldOffset: undefined as number | undefined,
	releaseHeldRead: () => undefined as void,
}));

vi.mock('@/config/useInstanceClient', () => {
	const instanceClient = {
		post: async (_url: string, body: { operation: string; offset?: number; limit?: number }) => {
			switch (body.operation) {
				case 'describe_table':
					return {
						data: {
							schema: 'data',
							name: 'pets',
							hash_attribute: 'id',
							audit: true,
							schema_defined: false,
							attributes: [{ attribute: 'id', is_primary_key: true }],
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
					instance.pageReads.push(offset);
					if (offset === instance.failingOffset) {
						throw new Error('The instance is unreachable');
					}
					const data = instance.records.slice(offset, offset + (body.limit ?? 0));
					if (offset === instance.heldOffset) {
						instance.heldOffset = undefined;
						await new Promise<void>((resolve) => {
							instance.releaseHeldRead = resolve;
						});
					}
					return { data, status: 200 };
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

const realNow = Date.now.bind(Date);
let clockAhead = 0;

// Every Browse read has a 60s staleTime, which the tests step past by moving the clock.
beforeEach(() => {
	vi.spyOn(Date, 'now').mockImplementation(() => realNow() + clockAhead);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	clockAhead = 0;
	focusManager.setFocused(undefined);
	instance.records = [];
	instance.pageReads = [];
	instance.failingOffset = undefined;
	instance.heldOffset = undefined;
	editor.navigation = undefined;
});

function seedPets(count: number) {
	instance.records = Array.from({ length: count }, (_, index) => ({ id: index + 1 }));
}

function renderPets(count: number) {
	seedPets(count);
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={queryClient}>
			<DatabaseTableView databaseName="data" tableName="pets" />
		</QueryClientProvider>,
	);
	return queryClient;
}

const findCell = (name: string) => screen.findByRole('cell', { name }, { timeout: 10_000 });

async function proveTheFirstPageIsTheLast({ clockAheadBeforeTheStep = 0 } = {}) {
	const queryClient = renderPets(20);
	fireEvent.click(await findCell('20'));
	expect(editor.navigation).toMatchObject({ position: 20, hasNext: true });
	clockAhead = clockAheadBeforeTheStep;

	act(() => editor.navigation!.onNext());
	await waitFor(() => expect(instance.pageReads).toContain(20));
	await waitFor(() => expect(editor.navigation).toMatchObject({ position: 20, hasNext: false }));
	return queryClient;
}

async function settle(queryClient: QueryClient) {
	await waitFor(() => expect(queryClient.isFetching()).toBe(0));
	await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
}

function refocusTheWindow() {
	act(() => {
		focusManager.setFocused(false);
		focusManager.setFocused(true);
	});
}

async function expectNextToReachTheNewRecord() {
	await waitFor(() => expect(editor.navigation).toMatchObject({ position: 20, hasNext: true }));
	act(() => editor.navigation!.onNext());
	await waitFor(() => expect(editor.navigation).toMatchObject({ position: 21 }));
}

describe('DatabaseTableView remembering the last page', { timeout: 30_000 }, () => {
	it('offers Next again once an import refreshes the page and the table has grown', async () => {
		const queryClient = await proveTheFirstPageIsTheLast();

		seedPets(21);
		// What useImportDataMutation's onSettled does for the table it imported into.
		await act(() => queryClient.invalidateQueries({ queryKey: ['instance-1', 'data', 'pets'] }));

		await expectNextToReachTheNewRecord();
	});

	// At 61s the focus refetch re-reads the count; the probe read at 59s is still fresh in the cache.
	it('re-probes after a window-focus refetch instead of reusing the cached empty answer', async () => {
		await proveTheFirstPageIsTheLast({ clockAheadBeforeTheStep: 59_000 });

		seedPets(21);
		clockAhead = 61_000;
		refocusTheWindow();

		await expectNextToReachTheNewRecord();
		expect(instance.pageReads).toEqual([0, 20, 0, 20]);
	});

	it('keeps the proof through the read of the page the step returns to', async () => {
		const queryClient = await proveTheFirstPageIsTheLast({ clockAheadBeforeTheStep: 61_000 });
		await settle(queryClient);

		expect(instance.pageReads).toEqual([0, 20, 0]);
		expect(editor.navigation).toMatchObject({ position: 20, hasNext: false });
	});

	it('forgets the proof when the count moves while another page is on screen', async () => {
		const queryClient = renderPets(40);
		await findCell('20');
		await settle(queryClient);
		fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
		fireEvent.click(await findCell('40'));
		act(() => editor.navigation!.onNext());
		await waitFor(() => expect(instance.pageReads).toContain(40));
		await waitFor(() => expect(editor.navigation).toMatchObject({ position: 40, hasNext: false }));

		fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
		await findCell('1');
		seedPets(41);
		await act(() => queryClient.invalidateQueries({ queryKey: ['instance-1', 'data', 'pets'] }));
		await settle(queryClient);
		fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
		fireEvent.click(await findCell('40'));

		expect(editor.navigation).toMatchObject({ position: 40, hasNext: true });
	});

	// The probe's empty answer was read before the count moved, so it proves nothing about the new count.
	it('ignores a probe whose answer predates a count that moved while it was out', async () => {
		const toastInfo = vi.spyOn(toast, 'info');
		const queryClient = renderPets(20);
		fireEvent.click(await findCell('20'));
		instance.heldOffset = 20;
		act(() => editor.navigation!.onNext());
		await waitFor(() => expect(instance.pageReads).toContain(20));

		seedPets(21);
		await act(() => queryClient.invalidateQueries({ queryKey: ['instance-1', 'data', 'pets', 'describe_table'] }));
		await waitFor(() => expect(editor.navigation?.total).toBe(21));
		act(() => instance.releaseHeldRead());

		await waitFor(() => expect(editor.navigation).toMatchObject({ position: 20, hasNext: true }));
		await settle(queryClient);
		expect(toastInfo).not.toHaveBeenCalledWith('This is the last record');
	});

	it('reads the next page afresh rather than joining a read of it that started earlier', async () => {
		const queryClient = renderPets(40);
		await findCell('20');
		await settle(queryClient);
		instance.heldOffset = 20;
		fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
		await waitFor(() => expect(instance.pageReads).toContain(20));
		fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));

		seedPets(20);
		await act(() => queryClient.invalidateQueries({ queryKey: ['instance-1', 'data', 'pets', 'describe_table'] }));
		fireEvent.click(await findCell('20'));
		act(() => editor.navigation!.onNext());
		act(() => instance.releaseHeldRead());
		await settle(queryClient);

		expect(editor.navigation).toMatchObject({ position: 20, hasNext: false });
	});

	it('reads a cached neighbouring page afresh before opening its row', async () => {
		const queryClient = await openTheFirstRecordOfTheNextPageAndComeBack();

		seedPets(20);
		// What the view's refreshTable does after a write.
		await act(() => queryClient.invalidateQueries({ queryKey: ['instance-1', 'data', 'pets'] }));
		await settle(queryClient);
		act(() => editor.navigation!.onNext());
		await settle(queryClient);

		expect(editor.navigation).toMatchObject({ position: 20, hasNext: false });
	});

	it('stays put when that read fails, rather than opening the cached row', async () => {
		const toastError = vi.spyOn(toast, 'error');
		const queryClient = await openTheFirstRecordOfTheNextPageAndComeBack();

		instance.failingOffset = 20;
		await act(() => queryClient.invalidateQueries({ queryKey: ['instance-1', 'data', 'pets'] }));
		await settle(queryClient);
		act(() => editor.navigation!.onNext());
		await settle(queryClient);

		expect(editor.navigation).toMatchObject({ position: 20 });
		expect(toastError).toHaveBeenCalledWith("Couldn't load the next page of records");
	});
});

async function openTheFirstRecordOfTheNextPageAndComeBack() {
	const queryClient = renderPets(21);
	fireEvent.click(await findCell('20'));
	act(() => editor.navigation!.onNext());
	await waitFor(() => expect(editor.navigation).toMatchObject({ position: 21 }));
	act(() => editor.navigation!.onPrevious());
	await waitFor(() => expect(editor.navigation).toMatchObject({ position: 20 }));
	return queryClient;
}
