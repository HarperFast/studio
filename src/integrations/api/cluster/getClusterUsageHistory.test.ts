import { describe, expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/config/apiClient', () => ({ apiClient: { get } }));

const { getClusterUsageHistoryQueryOptions } = await import('@/integrations/api/cluster/getClusterUsageHistory');

describe('getClusterUsageHistoryQueryOptions', () => {
	it("asks for the newest page with no cursor, then hands each page's nextBefore back as before", async () => {
		get.mockResolvedValue({ data: { cycles: [] } });
		const run = getClusterUsageHistoryQueryOptions('clu-1').queryFn as unknown as (
			context: { pageParam: string | null },
		) => Promise<unknown>;

		await run({ pageParam: null });
		expect(get).toHaveBeenLastCalledWith('/Cluster/clu-1/usage/history', { params: undefined });
		await run({ pageParam: '2025-11-28T19:17:46.624Z' });
		expect(get).toHaveBeenLastCalledWith('/Cluster/clu-1/usage/history', {
			params: { before: '2025-11-28T19:17:46.624Z' },
		});
	});

	it('stops paging on the last page', () => {
		const next = getClusterUsageHistoryQueryOptions('clu-1').getNextPageParam as unknown as (
			page: { nextBefore: string | null },
		) => string | undefined;
		expect(next({ nextBefore: '2025-11-28T19:17:46.624Z' })).toBe('2025-11-28T19:17:46.624Z');
		expect(next({ nextBefore: null })).toBeUndefined();
	});

	it('waits for a cluster id', () => {
		expect(getClusterUsageHistoryQueryOptions(undefined).enabled).toBe(false);
		expect(getClusterUsageHistoryQueryOptions('clu-1').enabled).toBe(true);
	});
});
