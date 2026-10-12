// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { AxiosInstance } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importData, type ImportDataParams, type ImportProgressListener, useImportDataMutation } from './importData';

function progressListener() {
	return {
		onJobUpdate: vi.fn<ImportProgressListener['onJobUpdate']>(),
		onSuccess: vi.fn<ImportProgressListener['onSuccess']>(),
		onError: vi.fn<ImportProgressListener['onError']>(),
	};
}

function csvClient(statuses: string[]) {
	let poll = 0;
	const post = vi.fn(async (_url: string, body: { operation: string }) => {
		if (body.operation === 'csv_url_load' || body.operation === 'csv_data_load') {
			return { data: { message: 'Starting job', job_id: 'job-1' } };
		}
		const status = statuses[Math.min(poll, statuses.length - 1)];
		poll += 1;
		return { data: [{ id: 'job-1', status, message: status === 'COMPLETE' ? 'loaded 5 of 5' : undefined }] };
	});
	return { post } as unknown as AxiosInstance;
}

function params(instanceClient: AxiosInstance, progress: ImportProgressListener): ImportDataParams {
	return {
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
