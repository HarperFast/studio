/** @vitest-environment jsdom */
import type { Cluster } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/config/apiClient', () => ({ apiClient: { get: apiGet } }));

const { ClusterDeleteNotice, describeDeleteFailure } = await import('./ClusterDeleteNotice');

const cluster = (overrides: Partial<Cluster> = {}): Cluster =>
	({
		id: 'clu-1',
		name: 'prod-east',
		organizationId: 'org-1',
		status: 'TERMINATING',
		workflowId: 'wf-1',
		plans: [{ planId: 'shared' }],
		instances: [{ id: 'ins-1', name: 'east-1' }, { id: 'ins-2', name: 'west-1' }, { id: 'ins-3', name: 'west-2' }],
		...overrides,
	}) as unknown as Cluster;

const paused = (overrides: Record<string, unknown> = {}) => ({
	id: 'wf-1',
	type: 'DELETE_CLUSTER',
	status: 'PAUSED',
	pause: { reason: 'failed', at: '2026-11-06T00:00:00.000Z' },
	failedInstanceIds: ['ins-2'],
	message: 'Instance ins-2 did not confirm the deletion in time.',
	...overrides,
});

async function renderNotice(state: Cluster) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<ClusterDeleteNotice cluster={state} />
		</QueryClientProvider>,
	);
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve));
	});
	return client;
}

// Observers hear of a settled fetch on a later tick than the refetch promise.
async function refetch(client: QueryClient) {
	await act(async () => {
		await client.refetchQueries();
		await new Promise((resolve) => setTimeout(resolve));
	});
}

afterEach(() => {
	cleanup();
	apiGet.mockReset();
});

describe(ClusterDeleteNotice, () => {
	it('shows central manager’s reason, naming the member the cluster record knows by id', async () => {
		apiGet.mockResolvedValue({ data: paused() });
		await renderNotice(cluster());
		const notice = await screen.findByRole('status');
		expect(notice.textContent).toBe(
			'Termination stoppedInstance west-1 did not confirm the deletion in time.Our team will finish it. The cluster stays listed until then.',
		);
		expect(apiGet).toHaveBeenCalledWith('/Cluster/clu-1/workflow');
	});

	it('says the read failed, rather than letting the page claim the teardown is under way, until one answers', async () => {
		const outage = new AxiosError('Request failed with status code 503');
		outage.response = { status: 503 } as AxiosError['response'];
		apiGet.mockRejectedValue(outage);
		await renderNotice(cluster());
		expect((await screen.findByRole('status')).textContent).toBe(
			'Couldn’t check on the terminationStudio couldn’t read how it is going.',
		);
	});

	it('says a later read failed too, keeping what the last one showed as its own, and recovers', async () => {
		const outage = new AxiosError('Request failed with status code 503');
		outage.response = { status: 503 } as AxiosError['response'];
		apiGet.mockResolvedValueOnce({
			data: paused({ status: 'RUNNING', pause: null, failedInstanceIds: [], message: null }),
		});
		const client = await renderNotice(cluster());
		expect(screen.queryByRole('status')).toBeNull();
		expect(apiGet).toHaveBeenCalledTimes(1);

		apiGet.mockRejectedValueOnce(outage);
		await refetch(client);
		expect(apiGet).toHaveBeenCalledTimes(2);
		expect(screen.getAllByRole('status').map((notice) => notice.textContent)).toEqual([
			'Couldn’t check on the terminationStudio couldn’t read how it is going.',
		]);

		apiGet.mockResolvedValueOnce({ data: paused() });
		await refetch(client);
		expect(screen.getAllByRole('status').map((notice) => notice.textContent)).toEqual([
			'Termination stoppedInstance west-1 did not confirm the deletion in time.Our team will finish it. The cluster stays listed until then.',
		]);

		apiGet.mockRejectedValueOnce(outage);
		await refetch(client);
		expect(screen.getAllByRole('status').map((notice) => notice.textContent)).toEqual([
			'Couldn’t check on the terminationStudio couldn’t read how it is going. What follows is from its last successful read.',
			'Termination stoppedInstance west-1 did not confirm the deletion in time.Our team will finish it. The cluster stays listed until then.',
		]);
	});

	it('says our team paused it, as a warning rather than a failure, for an operator pause', async () => {
		apiGet.mockResolvedValue({
			data: paused({ pause: { reason: 'command', at: null }, failedInstanceIds: [], message: null }),
		});
		await renderNotice(cluster());
		const notice = await screen.findByRole('status');
		expect(notice.textContent).toContain('Termination pausedOur team paused it.');
		expect(notice.className).toContain('amber');
	});

	it('calls it a removal for a self-hosted cluster', async () => {
		apiGet.mockResolvedValue({ data: paused() });
		await renderNotice(cluster({ plans: [{ planId: 'self-hosted-free' }] } as Partial<Cluster>));
		expect((await screen.findByRole('status')).textContent).toContain('Removal stopped');
	});

	it.each([
		['a delete still running', paused({ status: 'RUNNING', pause: null, failedInstanceIds: [], message: null })],
		['a paused workflow of another kind', paused({ type: 'UPDATE_HARPER_VERSION' })],
	])('shows nothing for %s', async (_case, row) => {
		apiGet.mockResolvedValue({ data: row });
		await renderNotice(cluster());
		expect(screen.queryByRole('status')).toBeNull();
	});

	it.each([404, 400])(
		'shows nothing, once, against a central manager that answers %s to the workflow read',
		async (status) => {
			const refused = new AxiosError(`Request failed with status code ${status}`);
			refused.response = { status } as AxiosError['response'];
			apiGet.mockRejectedValue(refused);
			await renderNotice(cluster());
			expect(screen.queryByRole('status')).toBeNull();
			expect(apiGet).toHaveBeenCalledTimes(1);
		},
	);

	it('reads nothing unless the cluster is being deleted', async () => {
		apiGet.mockResolvedValue({ data: paused() });
		for (const status of ['RUNNING', 'TERMINATED', 'REMOVED']) {
			await renderNotice(cluster({ status }));
			expect(screen.queryByRole('status'), status).toBeNull();
			cleanup();
		}
		expect(apiGet).not.toHaveBeenCalled();
	});
});

describe(describeDeleteFailure, () => {
	const record = cluster();
	it('keeps central manager’s reason and puts names to every id in it, in one pass', () => {
		const named = cluster({
			instances: [
				{ id: 'ins-1', name: 'primary' },
				{ id: 'ins-10', name: 'ins-1-replica' },
				{ id: 'ins-2', name: 'west' },
				{ id: 'ins-3', name: '' },
			],
		} as Partial<Cluster>);
		// ins-10's name contains ins-1; ins-2 is mentioned without failing; ins-3 has no name; ins-9 is unknown.
		expect(
			describeDeleteFailure(
				paused({
					failedInstanceIds: ['ins-1', 'ins-10', 'ins-9'],
					message: 'Instances ins-1, ins-10, ins-9 reported a failure; ins-2 and ins-3 are on the same host.',
				}),
				named,
			),
		).toBe('Instances primary, ins-1-replica, ins-9 reported a failure; west and ins-3 are on the same host.');
		expect(describeDeleteFailure(paused({ failedInstanceIds: [], message: 'The operation could not finish.' }), record))
			.toBe('The operation could not finish.');
		expect(describeDeleteFailure(paused({ message: 'Instance ins-2 is gone.' }), { instances: undefined })).toBe(
			'Instance ins-2 is gone.',
		);
	});

	it('lists the members itself without a sentence, falling back to the id of one the record has no name for', () => {
		expect(describeDeleteFailure(paused({ failedInstanceIds: ['ins-1', 'ins-3', 'ins-9'], message: null }), record))
			.toBe('Instances east-1, west-2 and ins-9 didn’t confirm they were terminated.');
		expect(describeDeleteFailure(paused({ failedInstanceIds: ['ins-1', 'ins-3'], message: null }), record)).toBe(
			'Instances east-1 and west-2 didn’t confirm they were terminated.',
		);
		expect(describeDeleteFailure(paused({ failedInstanceIds: ['ins-9'], message: null }), { instances: undefined }))
			.toBe('Instance ins-9 didn’t confirm it was terminated.');
		expect(
			describeDeleteFailure(paused({ failedInstanceIds: ['ins-1'], message: null }), {
				instances: [{ id: 'ins-1', name: '' }],
			} as Pick<Cluster, 'instances'>),
		).toBe('Instance ins-1 didn’t confirm it was terminated.');
		expect(describeDeleteFailure(paused({ failedInstanceIds: [], message: null }), record)).toBe(
			'A step of the teardown didn’t finish.',
		);
	});
});
