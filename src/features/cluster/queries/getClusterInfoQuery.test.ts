import { Cluster } from '@/integrations/api/api.patch';
import { QueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { getClusterInfoQueryOptions, markClusterPasswordSet } from './getClusterInfoQuery';

/** The subset of `Query` the `refetchInterval` callback reads. */
type ErrorStateQuery = { state: { error: unknown } };

function axiosErrorWithStatus(status: number): AxiosError {
	const err = new AxiosError(`Request failed with status code ${status}`);
	err.response = { status } as AxiosError['response'];
	return err;
}

function resolveInterval(refetch: boolean | number | undefined, error: unknown) {
	const { refetchInterval } = getClusterInfoQueryOptions('clu-test', refetch);
	expect(typeof refetchInterval).toBe('function');
	const resolve = refetchInterval as unknown as (q: ErrorStateQuery) => number | false;
	return resolve({ state: { error } });
}

describe('getClusterInfoQueryOptions polling', () => {
	it('defaults to a 10s poll when refetch is true', () => {
		expect(resolveInterval(true, null)).toBe(10_000);
	});

	it('honors an explicit interval', () => {
		expect(resolveInterval(2_000, null)).toBe(2_000);
	});

	it('does not poll when refetch is omitted', () => {
		expect(resolveInterval(undefined, null)).toBe(false);
	});

	it('stops polling after a 403 rather than retrying every 10s (RUM 2026-07-27)', () => {
		// One session emitted 349 doomed GET /Cluster/{id} requests in ~58 minutes.
		expect(resolveInterval(true, axiosErrorWithStatus(403))).toBe(false);
	});

	it('keeps polling after a recoverable failure', () => {
		expect(resolveInterval(true, axiosErrorWithStatus(500))).toBe(10_000);
		expect(resolveInterval(true, new Error('Network Error'))).toBe(10_000);
	});
});

describe('markClusterPasswordSet', () => {
	const CLUSTER_ID = 'clu-test1';

	function seedCluster(queryClient: QueryClient, cluster: Partial<Cluster>) {
		queryClient.setQueryData(getClusterInfoQueryOptions(CLUSTER_ID).queryKey, cluster as Cluster);
	}

	it('flips resetPassword off on the cached cluster and preserves everything else', async () => {
		const queryClient = new QueryClient();
		seedCluster(queryClient, { id: CLUSTER_ID, name: 'new2', status: 'RUNNING', resetPassword: true });

		await markClusterPasswordSet(queryClient, CLUSTER_ID);

		expect(queryClient.getQueryData(getClusterInfoQueryOptions(CLUSTER_ID).queryKey)).toEqual({
			id: CLUSTER_ID,
			name: 'new2',
			status: 'RUNNING',
			resetPassword: false,
		});
	});

	it('is a no-op when the cluster is not cached (no phantom entry created)', async () => {
		const queryClient = new QueryClient();

		await markClusterPasswordSet(queryClient, CLUSTER_ID);

		expect(queryClient.getQueryData(getClusterInfoQueryOptions(CLUSTER_ID).queryKey)).toBeUndefined();
	});

	it('leaves other clusters in the cache untouched', async () => {
		const queryClient = new QueryClient();
		seedCluster(queryClient, { id: CLUSTER_ID, resetPassword: true });
		queryClient.setQueryData(getClusterInfoQueryOptions('clu-other').queryKey, {
			id: 'clu-other',
			resetPassword: true,
		} as Cluster);

		await markClusterPasswordSet(queryClient, CLUSTER_ID);

		expect(queryClient.getQueryData(getClusterInfoQueryOptions('clu-other').queryKey)).toEqual({
			id: 'clu-other',
			resetPassword: true,
		});
	});

	it('cancels an in-flight poll so its stale response cannot overwrite resetPassword: false', async () => {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const staleCluster = { id: CLUSTER_ID, name: 'c', resetPassword: true } as Cluster;
		seedCluster(queryClient, staleCluster);

		// Start a background refetch whose response arrives late (simulates the 10s poll).
		let resolveStale!: (c: Cluster) => void;
		const fetchPromise = queryClient.fetchQuery({
			queryKey: getClusterInfoQueryOptions(CLUSTER_ID).queryKey,
			queryFn: ({ signal }) =>
				new Promise<Cluster>((resolve, reject) => {
					resolveStale = resolve;
					signal.addEventListener('abort', () => reject(new DOMException('AbortError', 'AbortError')));
				}),
		});

		// markClusterPasswordSet must cancel the in-flight fetch before writing the cache.
		await markClusterPasswordSet(queryClient, CLUSTER_ID);

		// Stale response arrives after cancellation — must not overwrite resetPassword: false.
		resolveStale({ ...staleCluster, resetPassword: true });
		await fetchPromise.catch(() => {});

		expect(queryClient.getQueryData(getClusterInfoQueryOptions(CLUSTER_ID).queryKey)).toMatchObject({
			resetPassword: false,
		});
	});
});
