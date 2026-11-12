import { queryErrorHandler } from '@/react-query/queryClient';
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), toastError: vi.fn() }));

vi.mock('@/config/apiClient', () => ({ apiClient: { get: mocks.get } }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, dismiss: vi.fn() } }));

import { getChatUsageQueryOptions } from './getChatUsage';

function httpError(status: number) {
	const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
	return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', config, undefined, {
		status,
		statusText: '',
		headers: {},
		config,
		data: { error: 'refused' },
	});
}

function fetchUsage() {
	const client = new QueryClient({
		queryCache: new QueryCache({ onError: queryErrorHandler }),
		defaultOptions: { queries: { retryDelay: 0 } },
	});
	return client.fetchQuery(getChatUsageQueryOptions('org-1'));
}

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('getChatUsageQueryOptions', () => {
	it('asks once and raises no toast when the org refuses usage to this member', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		mocks.get.mockRejectedValue(httpError(403));

		await expect(fetchUsage()).rejects.toThrow('403');

		expect(mocks.get).toHaveBeenCalledTimes(1);
		expect(mocks.toastError).not.toHaveBeenCalled();
		expect(console.error).not.toHaveBeenCalled();
	});

	it('still retries and reports a server failure', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		mocks.get.mockRejectedValue(httpError(500));

		await expect(fetchUsage()).rejects.toThrow('500');

		expect(mocks.get).toHaveBeenCalledTimes(4);
		expect(mocks.toastError).toHaveBeenCalledTimes(1);
	});
});
