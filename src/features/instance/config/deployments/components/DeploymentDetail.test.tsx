/**
 * @vitest-environment jsdom
 */
import { Deployment } from '@/integrations/api/instance/deployments/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeploymentDetail } from './DeploymentDetail';

const post = vi.hoisted(() => vi.fn());
vi.mock('@/config/useInstanceClient', () => {
	const params = { instanceClient: { post }, entityId: 'entity-1', entityType: 'instance' };
	return { useInstanceClientIdParams: () => params };
});
vi.mock('@/features/instance/applications/hooks/useSupportsDeploymentSSE', () => ({
	useSupportsDeploymentSSE: () => false,
	useStagedDeploymentsAvailable: () => true,
}));
vi.mock('@tanstack/react-router', () => {
	const params = {};
	const navigate = () => {};
	return { useParams: () => params, useNavigate: () => navigate, Link: () => null };
});

afterEach(() => {
	cleanup();
	post.mockReset();
});

function renderFailedDeployment(message: string) {
	const deployment: Deployment = {
		deployment_id: 'd1',
		project: 'widgets',
		status: 'failed',
		error: { message, phase: 'prepare' },
		// Harper appends the streamed `error` event to the log before recording the failure.
		event_log: [
			{ t: 1, event: 'phase', data: { phase: 'prepare', status: 'start' } },
			{ t: 2, event: 'error', data: { message, code: 500, phase: 'prepare' } },
		],
	};
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	queryClient.setQueryData(['entity-1', 'get_deployment', 'd1'], deployment);
	return render(
		<QueryClientProvider client={queryClient}>
			<DeploymentDetail deploymentId="d1" />
		</QueryClientProvider>,
	);
}

describe('DeploymentDetail', () => {
	it.each([
		"ENOENT: no such file or directory, open '/tmp/harper-git-clone-oXPS7c/package.json'",
		"ENOENT: no such file or directory, open 'C:\\Users\\h\\AppData\\Local\\Temp\\harper-git-clone-q1W2e3\\package.json'",
	])("explains a repository with no root package.json instead of showing the node's clone path: %s", (raw) => {
		renderFailedDeployment(raw);

		expect(screen.getAllByText(/This repository has no package\.json in its root folder\./)).toHaveLength(2);
		expect(screen.queryByText(/harper-git-clone/)).toBeNull();
	});

	it('shows any other failure as Harper reported it', () => {
		renderFailedDeployment('Failed to clone package acme/widgets: fatal: repository not found');

		expect(screen.getByText('Failed to clone package acme/widgets: fatal: repository not found')).toBeTruthy();
	});
});

describe('DeploymentDetail of a rolling deploy', () => {
	function renderDeployment(deployment: Deployment) {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		queryClient.setQueryData(['entity-1', 'get_deployment', deployment.deployment_id], deployment);
		return render(
			<QueryClientProvider client={queryClient}>
				<DeploymentDetail deploymentId={deployment.deployment_id} />
			</QueryClientProvider>,
		);
	}

	it('shows which nodes did not take a partial deploy, rather than how they staged it', () => {
		renderDeployment({
			deployment_id: 'd1',
			project: 'widgets',
			status: 'partial',
			error: { message: 'Not activated on 1 of 2 peer node(s): b (certification rejected)', nodes: ['b'] },
			peer_results: [
				{ node: 'a', status: 'success', activation: { activated: true } },
				{ node: 'b', status: 'success', activation: { activated: false, error: 'certification rejected' } },
			],
		});

		expect(screen.getByText('Partial')).toBeTruthy();
		expect(screen.getByText('activated')).toBeTruthy();
		expect(screen.getByText('not activated: certification rejected')).toBeTruthy();
		expect(screen.queryByText('success')).toBeNull();
	});

	// Harper's `partialRollout`: an activation job that failed or was cut short records no activation for a node.
	it('does not show a node a partial deploy never reached as a success', () => {
		renderDeployment({
			deployment_id: 'd1',
			project: 'widgets',
			status: 'partial',
			error: { message: 'The activation job failed: boom; not confirmed on: b', nodes: ['b', 'c'] },
			peer_results: [
				{ node: 'a', status: 'success', activation: { activated: true } },
				{ node: 'b', status: 'success' },
				{ node: 'c', status: 'failed', error: 'disk full' },
			],
		});

		expect(screen.getByText('activation not confirmed').className).toContain('text-destructive');
		expect(screen.getByText('failed: disk full')).toBeTruthy();
		expect(screen.queryByText('success')).toBeNull();
	});

	it('shows a node a rolling deploy has not reached yet as waiting, not as a success', () => {
		renderDeployment({
			deployment_id: 'd1',
			project: 'widgets',
			status: 'rolling_out',
			peer_results: [
				{ node: 'a', status: 'success', activation: { activated: true } },
				{ node: 'b', status: 'success' },
			],
		});

		expect(screen.getByText('Rolling out')).toBeTruthy();
		expect(screen.getByText('waiting to activate').className).toContain('text-muted-foreground');
		expect(screen.queryByText('success')).toBeNull();
	});
});

describe('DeploymentDetail of a staged release', () => {
	const staged: Deployment = { deployment_id: 'd1', project: 'widgets', status: 'staged', started_at: 100 };

	function renderStaged(history: Deployment[]) {
		post.mockImplementation((_url: string, body: { operation: string }) =>
			Promise.resolve({
				data: body.operation === 'list_deployments' ? { deployments: history, total: history.length } : staged,
			})
		);
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		queryClient.setQueryData(['entity-1', 'get_deployment', 'd1'], staged);
		return render(
			<QueryClientProvider client={queryClient}>
				<DeploymentDetail deploymentId="d1" />
			</QueryClientProvider>,
		);
	}

	it('offers to activate a staged release nothing has activated', async () => {
		renderStaged([staged]);
		expect(await screen.findByText(/but not live/)).toBeTruthy();
		expect(screen.getByRole('button', { name: /Activate/ })).toBeTruthy();
	});

	it('says an activated one is live instead, and offers no Activate', async () => {
		renderStaged([
			{ deployment_id: 'd2', project: 'widgets', status: 'success', started_at: 200, activated_from: 'd1' },
			staged,
		]);
		expect(await screen.findByText(/Live: activated by/)).toBeTruthy();
		expect(screen.queryByText(/but not live/)).toBeNull();
		expect(screen.queryByRole('button', { name: /Activate/ })).toBeNull();
	});
});
