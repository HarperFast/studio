/** @vitest-environment jsdom */
import { heldClusterWorkflowQueryOptions } from '@/features/admin/workflows/workflowAdminApi';
import { latestClusterWorkflowQueryOptions } from '@/features/cluster/queries/clusterWorkflow';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { getInstanceInfoQueryOptions } from '@/features/cluster/queries/getInstanceInfoQuery';
import { getClusterUsageQueryOptions } from '@/integrations/api/cluster/getClusterUsage';
import { isCancelledError, QueryClient, type QueryKey, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { removeEntityQueries } from './removeEntityQueries';

let queryClient = new QueryClient();

afterEach(() => {
	queryClient.clear();
	queryClient = new QueryClient();
});

const cached = (queryKey: QueryKey) => queryClient.getQueryCache().find({ queryKey, exact: true }) !== undefined;

function seed(queryKey: QueryKey) {
	queryClient.setQueryData(queryKey, { read: 'before the sign-out' });
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('removeEntityQueries', () => {
	it("drops the entity's reads under either key convention, and read_log's", () => {
		const keys: QueryKey[] = [
			['ins-a', 'get_components'],
			['ins-a', 'data', 'dog'],
			['get_status', 'ins-a'],
			['read_log', undefined, 'desc', 0, 'ins-a', 60, 100],
		];
		keys.forEach(seed);

		removeEntityQueries(queryClient, 'ins-a');

		expect(keys.filter(cached)).toEqual([]);
	});

	it("leaves a sibling instance's reads and the cluster's", () => {
		const keys: QueryKey[] = [
			['ins-b', 'get_components'],
			['get_status', 'ins-b'],
			['clu-1', 'get_components'],
			['org-1', 'roles'],
		];
		keys.forEach(seed);

		removeEntityQueries(queryClient, 'ins-a');

		expect(keys.filter(cached)).toEqual(keys);
	});

	it("keeps central manager's records of the entity", async () => {
		const records = [
			getClusterInfoQueryOptions('clu-1'),
			getInstanceInfoQueryOptions({ clusterId: 'clu-1', instanceId: 'ins-a' }),
			getClusterUsageQueryOptions('clu-1'),
			latestClusterWorkflowQueryOptions('clu-1', 'wf-1'),
			heldClusterWorkflowQueryOptions('clu-1', 'wf-1'),
		];
		for (const options of records) {
			// The real options, so the query carries their `meta`.
			await queryClient.fetchQuery({ ...options, queryFn: () => ({}) } as never);
		}

		removeEntityQueries(queryClient, 'clu-1');
		removeEntityQueries(queryClient, 'ins-a');

		expect(records.map(({ queryKey }) => cached(queryKey))).toEqual(records.map(() => true));
	});

	it('keeps a query a mounted component is reading, and drops one whose reader is disabled', () => {
		seed(['ins-a', 'get_components']);
		seed(['ins-a', 'registration_info']);
		const reading = new QueryObserver(queryClient, {
			queryKey: ['ins-a', 'get_components'],
			queryFn: () => ({}),
			staleTime: Infinity,
		});
		const disabled = new QueryObserver(queryClient, {
			queryKey: ['ins-a', 'registration_info'],
			queryFn: () => ({}),
			enabled: false,
		});
		const unsubscribe = [reading.subscribe(() => {}), disabled.subscribe(() => {})];

		removeEntityQueries(queryClient, 'ins-a');

		expect(cached(['ins-a', 'get_components'])).toBe(true);
		expect(cached(['ins-a', 'registration_info'])).toBe(false);
		unsubscribe.forEach((stop) => stop());
	});

	it('rejects a read still out, rather than landing it or resolving with the data the query held', async () => {
		const queryKey = ['ins-a', 'get_components'];
		seed(queryKey);
		const answer = deferred<{ read: string }>();
		const read = queryClient.fetchQuery({ queryKey, queryFn: () => answer.promise, staleTime: 0 });

		removeEntityQueries(queryClient, 'ins-a');
		answer.resolve({ read: 'after the sign-out' });

		await expect(read).rejects.toSatisfy(isCancelledError);
		expect(queryClient.getQueryData(queryKey)).toBeUndefined();
	});
});
