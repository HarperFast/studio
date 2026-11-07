import { AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/config/apiClient', () => ({ apiClient: { get: apiGet } }));

const { latestClusterWorkflowQueryOptions } = await import('./clusterWorkflow');

/** The subset of `Query` the `refetchInterval` callback reads. */
type PolledQuery = { state: { data?: unknown; error: unknown } };

function axiosErrorWithStatus(status: number): AxiosError {
	const error = new AxiosError(`Request failed with status code ${status}`);
	error.response = { status } as AxiosError['response'];
	return error;
}

const ROW = {
	id: 'wf-1',
	type: 'DELETE_CLUSTER',
	status: 'PAUSED',
	phase: 'run',
	pause: { reason: 'failed', at: '2026-11-06T00:00:00.000Z' },
	failedInstanceIds: ['ins-1', 7, null],
	message: 'Instance ins-1 did not confirm the deletion in time.',
};

function read(clusterId = 'clu-1', heldBy?: string | null) {
	const options = latestClusterWorkflowQueryOptions(clusterId, heldBy);
	return (options.queryFn as () => Promise<unknown>)();
}

function interval(data: unknown, error: unknown = null, heldBy: string | null = 'wf-1') {
	const options = latestClusterWorkflowQueryOptions('clu-1', heldBy);
	return (options.refetchInterval as (query: PolledQuery) => number | false)({ state: { data, error } });
}

afterEach(() => apiGet.mockReset());

describe(latestClusterWorkflowQueryOptions, () => {
	it('reads the customer view of the cluster’s workflow and keeps only string instance ids', async () => {
		apiGet.mockResolvedValue({ data: ROW });
		await expect(read()).resolves.toEqual({ ...ROW, failedInstanceIds: ['ins-1'] });
		expect(apiGet).toHaveBeenCalledWith('/Cluster/clu-1/workflow');
	});

	it('answers null for a 404 (a cluster without a workflow) and for the 400 of a central manager older than the read, and then stops polling', async () => {
		apiGet.mockRejectedValue(axiosErrorWithStatus(404));
		await expect(read()).resolves.toBeNull();
		// Before the endpoint, the path falls through to the operations proxy, which refuses its shape.
		apiGet.mockRejectedValue(axiosErrorWithStatus(400));
		await expect(read()).resolves.toBeNull();
		expect(interval(null)).toBe(false);
	});

	it('polls every 10s while a workflow holds the cluster, from the first read on, and reads once otherwise', () => {
		expect(interval(undefined)).toBe(10_000);
		expect(interval({ ...ROW, failedInstanceIds: [] })).toBe(10_000);
		expect(interval(undefined, null, null)).toBe(false);
	});

	it('lets any other failure through, logged by the query client rather than toasted, and stops on a 403', async () => {
		apiGet.mockRejectedValue(axiosErrorWithStatus(500));
		await expect(read()).rejects.toThrow('500');
		expect(latestClusterWorkflowQueryOptions('clu-1').meta).toEqual({ reportsOwnFailure: true });
		expect(interval(undefined, axiosErrorWithStatus(403))).toBe(false);
	});

	it('treats a body without an id or status as no workflow', async () => {
		apiGet.mockResolvedValue({ data: { id: 'wf-1' } });
		await expect(read()).resolves.toBeNull();
	});

	it('is keyed by the cluster and the workflow holding it, and disabled without a cluster', () => {
		expect(latestClusterWorkflowQueryOptions('clu-1', 'wf-1').queryKey).toEqual(['cluster-workflow', 'clu-1', 'wf-1']);
		expect(latestClusterWorkflowQueryOptions('clu-1', null).queryKey).toEqual(['cluster-workflow', 'clu-1', '']);
		expect(latestClusterWorkflowQueryOptions(undefined).enabled).toBe(false);
		expect(latestClusterWorkflowQueryOptions('clu-1').enabled).toBe(true);
	});
});
