// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { AxiosError, type AxiosInstance, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDescribeAllQueryOptions } from './getDescribeAll';
import { getDescribeTableQueryOptions } from './getDescribeTable';
import { getSearchByConditionsOptions } from './getSearchByConditions';
import { getSearchByValueOptions } from './getSearchByValue';
import { getTableRecordCountQueryOptions } from './getTableRecordCount';
import {
	awaitDatabaseMapRefresh,
	importData,
	type ImportDataParams,
	type ImportProgressListener,
	useImportDataMutation,
} from './importData';

function progressListener() {
	return {
		onJobUpdate: vi.fn<ImportProgressListener['onJobUpdate']>(),
		onSuccess: vi.fn<ImportProgressListener['onSuccess']>(),
		onError: vi.fn<ImportProgressListener['onError']>(),
	};
}

function csvClient(statuses: string[], completeMessage = 'loaded 5 of 5') {
	let poll = 0;
	const post = vi.fn(async (_url: string, body: { operation: string }) => {
		if (body.operation === 'csv_url_load' || body.operation === 'csv_data_load') {
			return { data: { message: 'Starting job', job_id: 'job-1' } };
		}
		const status = statuses[Math.min(poll, statuses.length - 1)];
		poll += 1;
		return { data: [{ id: 'job-1', status, message: status === 'COMPLETE' ? completeMessage : undefined }] };
	});
	return { post } as unknown as AxiosInstance;
}

function params(instanceClient: AxiosInstance, progress: ImportProgressListener): ImportDataParams {
	return {
		entityId: 'instance-1',
		database: 'data',
		table: 'dog',
		tableExists: true,
		replicated: false,
		source: { kind: 'csv-url', url: 'https://example.com/dogs.csv' },
		instanceClient,
		progress,
	};
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('importData', () => {
	it("hands each poll of a CSV load's job to the progress listener", async () => {
		const progress = progressListener();
		const pending = importData(params(csvClient(['CREATED', 'IN_PROGRESS', 'COMPLETE']), progress));
		await vi.advanceTimersByTimeAsync(5_000);

		await expect(pending).resolves.toEqual({ message: 'loaded 5 of 5' });
		expect(progress.onJobUpdate.mock.calls.map(([job]) => job.status)).toEqual(['CREATED', 'IN_PROGRESS', 'COMPLETE']);
	});

	it('does the same for an uploaded CSV', async () => {
		const progress = progressListener();
		const pending = importData({
			...params(csvClient(['IN_PROGRESS', 'COMPLETE']), progress),
			source: { kind: 'csv-data', data: 'name\nRex' },
		});
		await vi.advanceTimersByTimeAsync(5_000);

		await expect(pending).resolves.toEqual({ message: 'loaded 5 of 5' });
		expect(progress.onJobUpdate.mock.calls.map(([job]) => job.status)).toEqual(['IN_PROGRESS', 'COMPLETE']);
	});
});

describe('useImportDataMutation', () => {
	function wrapper() {
		const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
		return ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		);
	}

	it('settles the progress listener even when the component that started the import has unmounted', async () => {
		const progress = progressListener();
		const { result, unmount } = renderHook(() => useImportDataMutation(), { wrapper: wrapper() });

		act(() => result.current.mutate(params(csvClient(['IN_PROGRESS', 'COMPLETE']), progress)));
		unmount();
		await vi.advanceTimersByTimeAsync(5_000);

		expect(progress.onSuccess).toHaveBeenCalledWith({ message: 'loaded 5 of 5' });
		expect(progress.onError).not.toHaveBeenCalled();
	});

	it('keeps a completed import successful when the progress listener throws', async () => {
		const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		const progress = progressListener();
		progress.onSuccess.mockImplementation(() => {
			throw new Error('toast exploded');
		});
		const { result } = renderHook(() => useImportDataMutation(), { wrapper: wrapper() });

		act(() => result.current.mutate(params(csvClient(['COMPLETE']), progress)));
		await vi.advanceTimersByTimeAsync(5_000);

		expect(result.current.isSuccess).toBe(true);
		expect(progress.onError).not.toHaveBeenCalled();
		debug.mockRestore();
	});

	it('settles the progress listener as failed when the import fails', async () => {
		const progress = progressListener();
		const { result } = renderHook(() => useImportDataMutation(), { wrapper: wrapper() });

		act(() => result.current.mutate(params(csvClient(['IN_PROGRESS', 'ERROR']), progress)));
		await vi.advanceTimersByTimeAsync(5_000);

		expect(progress.onError).toHaveBeenCalledTimes(1);
		expect(progress.onSuccess).not.toHaveBeenCalled();
	});
});

describe('useImportDataMutation refreshing Browse', () => {
	afterEach(() => vi.restoreAllMocks());

	const browse = { entityId: 'instance-1', instanceClient: {} as AxiosInstance };
	const page = { sort: { attribute: 'id', descending: false }, pageIndex: 0, pageSize: 20, onlyIfCached: true };
	// The real builders, so the keys refreshed here are the keys Browse reads.
	const keys = (tableName: string) => ({
		page: getSearchByValueOptions({
			...browse,
			...page,
			enabled: true,
			databaseName: 'data',
			tableName,
			searchAttribute: 'id',
		}).queryKey,
		filtered: getSearchByConditionsOptions({
			...browse,
			...page,
			enabled: true,
			databaseName: 'data',
			tableName,
			conditions: [{ search_attribute: 'name', search_type: 'equals', search_value: 'Rex' }],
		}).queryKey,
		count: getTableRecordCountQueryOptions({ ...browse, enabled: true, databaseName: 'data', tableName }).queryKey,
		describe: getDescribeTableQueryOptions({ ...browse, databaseName: 'data', tableName }).queryKey,
	});
	const treeKey = getDescribeAllQueryOptions({ ...browse, skipRecordCount: true, includeComputed: true }).queryKey;

	function wrapperFor(client: QueryClient) {
		return ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		);
	}

	async function openBrowse(client: QueryClient, tree = vi.fn(async (): Promise<object> => ({ dog: {} }))) {
		const reads = {
			page: vi.fn(async () => ({ data: [] })),
			describe: vi.fn(async () => ({ record_count: 0 })),
			otherPage: vi.fn(async () => ({ data: [] })),
			tree,
		};
		// Browse's own staleTime, so within the test only an invalidation refetches.
		const staleTime = 60_000;
		renderHook(() => {
			useQuery({ queryKey: [...keys('dog').page], queryFn: reads.page, staleTime });
			useQuery({ queryKey: [...keys('dog').describe], queryFn: reads.describe, staleTime });
			useQuery({ queryKey: [...keys('cat').page], queryFn: reads.otherPage, staleTime });
			useQuery({ queryKey: [...treeKey], queryFn: reads.tree, staleTime });
		}, { wrapper: wrapperFor(client) });
		// Cached but not on screen, so an invalidation only marks them stale.
		client.setQueryData([...keys('dog').filtered], { data: [] });
		client.setQueryData([...keys('dog').count], 5);
		await vi.advanceTimersByTimeAsync(0);
		for (const read of Object.values(reads)) {
			expect(read).toHaveBeenCalledTimes(1);
		}
		return reads;
	}

	function startImport(client: QueryClient, instanceClient: AxiosInstance, overrides: Partial<ImportDataParams> = {}) {
		const modal = renderHook(() => useImportDataMutation(), { wrapper: wrapperFor(client) });
		act(() => modal.result.current.mutate({ ...params(instanceClient, progressListener()), ...overrides }));
		return modal;
	}

	const rejection = (status?: number) =>
		new AxiosError(
			status ? `Request failed with status code ${status}` : 'Network Error',
			status ? AxiosError.ERR_BAD_REQUEST : AxiosError.ERR_NETWORK,
			undefined,
			undefined,
			status ? ({ status, data: 'refused' } as AxiosResponse) : undefined,
		);

	function createsTableThenRefuses() {
		const post = vi.fn(async (_url: string, body: { operation: string }) => {
			if (body.operation === 'create_table') {
				return { data: { message: 'table created' } };
			}
			throw rejection(400);
		});
		return { post } as unknown as AxiosInstance;
	}

	it('refetches the imported table and the tree once the job completes, rows skipped and the modal unmounted', async () => {
		const client = new QueryClient();
		const reads = await openBrowse(client);

		startImport(client, csvClient(['IN_PROGRESS', 'COMPLETE'], 'successfully loaded 3 of 5 records')).unmount();
		await vi.advanceTimersByTimeAsync(5_000);

		expect(reads.page).toHaveBeenCalledTimes(2);
		expect(reads.describe).toHaveBeenCalledTimes(2);
		expect(reads.tree).toHaveBeenCalledTimes(2);
		expect(client.getQueryState([...keys('dog').filtered])?.isInvalidated).toBe(true);
		expect(client.getQueryState([...keys('dog').count])?.isInvalidated).toBe(true);
		expect(reads.otherPage).toHaveBeenCalledTimes(1);
	});

	const answeredFailures: [string, () => AxiosInstance, Partial<ImportDataParams>, number][] = [
		['the job ended in ERROR', () => csvClient(['IN_PROGRESS', 'ERROR']), {}, 5_000],
		['the wait timed out on a load still running', () => csvClient(['IN_PROGRESS']), {}, 11 * 60_000],
		[
			'Harper refused the records for a table the import had just created',
			createsTableThenRefuses,
			{ tableExists: false, source: { kind: 'json-records', records: [{ name: 'Rex' }] } },
			5_000,
		],
	];
	it.each(answeredFailures)('refetches too when %s', async (_case, instanceClient, overrides, waitMs) => {
		const client = new QueryClient();
		const reads = await openBrowse(client);

		const modal = startImport(client, instanceClient(), overrides);
		await vi.advanceTimersByTimeAsync(waitMs);

		expect(modal.result.current.isError).toBe(true);
		expect(reads.page).toHaveBeenCalledTimes(2);
		expect(reads.tree).toHaveBeenCalledTimes(2);
	});

	it.each([
		['the submission got no answer', async () => {
			throw rejection();
		}],
		['a gateway answered 504', async () => {
			throw rejection(504);
		}],
		['the polls stopped answering', async (_url: string, body: { operation: string }) => {
			if (body.operation === 'csv_url_load') {
				return { data: { message: 'Starting job', job_id: 'job-1' } };
			}
			throw rejection();
		}],
	])('only marks Browse stale when %s', async (_case, post) => {
		const client = new QueryClient();
		const reads = await openBrowse(client);

		const modal = startImport(client, { post: vi.fn(post) } as unknown as AxiosInstance);
		await vi.advanceTimersByTimeAsync(10_000);

		expect(modal.result.current.isError).toBe(true);
		expect(reads.page).toHaveBeenCalledTimes(1);
		expect(reads.tree).toHaveBeenCalledTimes(1);
		expect(client.getQueryState([...keys('dog').page])?.isInvalidated).toBe(true);
		expect(client.getQueryState([...treeKey])?.isInvalidated).toBe(true);
		expect(client.getQueryState([...keys('cat').page])?.isInvalidated).toBe(false);
	});

	it('settles at the job verdict, and a caller waiting for the map joins the refetch already in flight', async () => {
		const client = new QueryClient();
		let landRefetch!: (map: object) => void;
		const tree = vi.fn<() => Promise<object>>()
			.mockResolvedValueOnce({})
			.mockImplementationOnce(() =>
				new Promise((resolve) => {
					landRefetch = resolve;
				})
			);
		await openBrowse(client, tree);

		let mapAtNavigation: unknown;
		const modal = renderHook(() => useImportDataMutation(), { wrapper: wrapperFor(client) });
		act(() =>
			modal.result.current.mutate(params(csvClient(['COMPLETE']), progressListener()), {
				onSuccess: async () => {
					await awaitDatabaseMapRefresh(client, 'instance-1');
					mapAtNavigation = client.getQueryData([...treeKey]);
				},
			})
		);
		await vi.advanceTimersByTimeAsync(0);

		expect(modal.result.current.isSuccess).toBe(true);
		expect(mapAtNavigation).toBeUndefined();

		landRefetch({ dog: {} });
		await vi.advanceTimersByTimeAsync(0);

		expect(mapAtNavigation).toEqual({ dog: {} });
		expect(tree).toHaveBeenCalledTimes(2);
	});

	it('keeps a completed import successful when the refresh throws', async () => {
		const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		const client = new QueryClient();
		vi.spyOn(client, 'invalidateQueries').mockImplementation(() => {
			throw new Error('cache exploded');
		});
		const progress = progressListener();
		const modal = renderHook(() => useImportDataMutation(), { wrapper: wrapperFor(client) });

		act(() => modal.result.current.mutate(params(csvClient(['COMPLETE']), progress)));
		await vi.advanceTimersByTimeAsync(5_000);

		expect(modal.result.current.isSuccess).toBe(true);
		expect(progress.onError).not.toHaveBeenCalled();
		expect(debug).toHaveBeenCalledWith('Refreshing the imported table failed', expect.any(Error));
	});
});
