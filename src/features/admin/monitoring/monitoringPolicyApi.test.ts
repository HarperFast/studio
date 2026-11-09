import { STUCK_AFTER_MS } from '@/features/admin/monitoring/checkStatus';
import { notifyPoliciesQueryOptions } from '@/features/admin/monitoring/monitoringPolicyApi';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/apiClient', () => ({ apiClient: {} }));

const setAt = '2026-10-20T12:00:00.000Z';
const setMs = Date.parse(setAt);
const pending = { clusterId: 'clu-1', organizationId: 'org-1', monitoringPolicy: 'notify' as const, setAt };
const applied = { ...pending, checkProjection: { setAt, finishedAt: new Date(setMs + 500).toISOString() } };

function intervalFor(data: unknown[], dataUpdatedAt: number) {
	const refetchInterval = notifyPoliciesQueryOptions().refetchInterval as (query: unknown) => number | false;
	return refetchInterval({ state: { data, dataUpdatedAt, error: null, fetchFailureCount: 0 } });
}

describe('notifyPoliciesQueryOptions polling', () => {
	it('polls only while a change can still reach its checks', () => {
		expect(intervalFor([pending], setMs + 1000)).toBe(30_000);
		expect(intervalFor([applied], setMs + 1000)).toBe(false);
		expect(intervalFor([pending], setMs + STUCK_AFTER_MS), 'a stuck change has no retry left to wait for').toBe(false);
	});
});
