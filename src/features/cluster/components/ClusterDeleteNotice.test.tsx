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
	// The read resolves on a later tick.
	await act(async () => {
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
		expect((await screen.findByRole('status')).textContent).toContain('Couldn’t check on the termination');
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
	it('keeps central manager’s reason and puts names to the ids in it, longest id first', () => {
		const named = cluster({
			instances: [{ id: 'ins-1', name: 'east-1' }, { id: 'ins-10', name: 'east-10' }],
		} as Partial<Cluster>);
		expect(
			describeDeleteFailure(
				paused({
					failedInstanceIds: ['ins-1', 'ins-10', 'ins-9'],
					message: 'Instances ins-1, ins-10, ins-9 reported a failure during the deletion.',
				}),
				named,
			),
		).toBe('Instances east-1, east-10, ins-9 reported a failure during the deletion.');
		expect(describeDeleteFailure(paused({ failedInstanceIds: [], message: 'The operation could not finish.' }), record))
			.toBe('The operation could not finish.');
	});

	it('lists the members itself without a sentence, falling back to the id of one the record no longer has', () => {
		expect(describeDeleteFailure(paused({ failedInstanceIds: ['ins-1', 'ins-3', 'ins-9'], message: null }), record))
			.toBe('Instances east-1, west-2 and ins-9 didn’t confirm they were terminated.');
		expect(describeDeleteFailure(paused({ failedInstanceIds: ['ins-1', 'ins-3'], message: null }), record)).toBe(
			'Instances east-1 and west-2 didn’t confirm they were terminated.',
		);
		expect(describeDeleteFailure(paused({ failedInstanceIds: ['ins-9'], message: null }), { instances: undefined }))
			.toBe('Instance ins-9 didn’t confirm it was terminated.');
		expect(describeDeleteFailure(paused({ failedInstanceIds: [], message: null }), record)).toBe(
			'A step of the teardown didn’t finish.',
		);
	});
});
