/** @vitest-environment jsdom */
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import type { LocalUser } from '@/integrations/api/api.patch';
import { queryClient } from '@/react-query/queryClient';
import { type QueryKey, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { authStore } from './authStore';

const cached = (queryKey: QueryKey) => queryClient.getQueryCache().find({ queryKey, exact: true }) !== undefined;

afterEach(() => {
	for (const id of ['clu-1', 'ins-a', 'ins-b']) {
		authStore.signOutLocally(id);
	}
	localStorage.clear();
	queryClient.clear();
});

// Every local end of an entity's sign-in drops its cached reads: the per-entity sign-outs (instance sign-out, a
// terminated or removed cluster, cluster setup) through `signOutLocally`, and Disconnect, the clusters list's sign-out,
// a switch to Direct Sign In and entering a sign-in form through a null user.
describe.each([
	['signOutEntitiesLocally', (id: string) => authStore.signOutEntitiesLocally([id])],
	['a null user', (id: string) => authStore.setUserForIdAndKey(id, `https://${id}.example.com:9925/`, null)],
])("%s drops the entity's cached reads (#1993)", (_, signOut) => {
	it("and leaves another entity's and central manager's record of the cluster", async () => {
		authStore.setUserForIdAndKey('clu-1', 'https://clu-1.example.com:9925/', { username: 'admin' } as LocalUser);
		const dropped: QueryKey[] = [['clu-1', 'get_components'], ['get_status', 'clu-1']];
		const kept: QueryKey[] = [['ins-b', 'get_components'], getClusterInfoQueryOptions('clu-1').queryKey];
		for (const queryKey of dropped.concat(kept.slice(0, 1))) {
			queryClient.setQueryData(queryKey, { read: 'before the sign-out' });
		}
		await queryClient.fetchQuery({ ...getClusterInfoQueryOptions('clu-1'), queryFn: () => ({}) } as never);

		signOut('clu-1');

		expect(dropped.filter(cached)).toEqual([]);
		expect(kept.filter(cached)).toEqual(kept);
	});
});

describe("the entity's next sign-in (#1993)", () => {
	const url = 'https://ins-a.example.com:9925/';
	const queryKey = ['ins-a', 'get_components'];

	it('drops a read a page went on showing through the sign-out and has since let go', () => {
		authStore.setUserForIdAndKey('ins-a', url, { username: 'first' } as LocalUser);
		queryClient.setQueryData(queryKey, { read: 'by the first user' });
		const page = new QueryObserver(queryClient, { queryKey, queryFn: () => ({}), staleTime: Infinity });
		const unmount = page.subscribe(() => {});

		authStore.signOutLocally('ins-a');
		expect(cached(queryKey)).toBe(true);
		unmount();
		authStore.setUserForIdAndKey('ins-a', url, { username: 'second' } as LocalUser);

		expect(cached(queryKey)).toBe(false);
	});

	it('keeps the cache when the entity is signed in already, as when Fabric Connect resolves again', () => {
		authStore.setUserForIdAndKey('ins-a', url, { username: 'admin' } as LocalUser);
		queryClient.setQueryData(queryKey, { read: 'this session' });

		authStore.setUserForIdAndKey('ins-a', url, { username: 'admin' } as LocalUser);

		expect(cached(queryKey)).toBe(true);
	});
});
