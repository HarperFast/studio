/**
 * @vitest-environment jsdom
 */
import { Deployment } from '@/integrations/api/instance/deployments/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeploymentDetail } from './DeploymentDetail';

const post = vi.hoisted(() => vi.fn());
const releaseTracking = vi.hoisted(() => ({ available: false }));
vi.mock('@/config/useInstanceClient', () => {
	const params = { instanceClient: { post }, entityId: 'entity-1', entityType: 'instance' };
	return { useInstanceClientIdParams: () => params };
});
vi.mock('@/features/instance/applications/hooks/useSupportsDeploymentSSE', () => ({
	useSupportsDeploymentSSE: () => false,
	useStagedDeploymentsAvailable: () => true,
	useReleaseTrackingAvailable: () => releaseTracking.available,
}));
vi.mock('@tanstack/react-router', () => {
	const params = {};
	const navigate = () => {};
	return { useParams: () => params, useNavigate: () => navigate, Link: () => null };
});

afterEach(() => {
	cleanup();
	post.mockReset();
	releaseTracking.available = false;
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

	it('falls back to the activation message when a node that did not take it recorded no error', () => {
		renderDeployment({
			deployment_id: 'd1',
			project: 'widgets',
			status: 'partial',
			peer_results: [{ node: 'b', status: 'success', activation: { activated: false, message: 'timed out' } }],
		});

		expect(screen.getByText('not activated: timed out')).toBeTruthy();
	});

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

describe('DeploymentDetail on Harper 5.4', () => {
	const SHA = '0123456789abcdef0123456789abcdef01234567';

	function renderRecord(deployment: Deployment, releases?: object | Error) {
		releaseTracking.available = true;
		post.mockImplementation((_url: string, body: { operation: string }) => {
			if (body.operation === 'list_releases') {
				return releases instanceof Error ? Promise.reject(releases) : Promise.resolve({ data: releases });
			}
			return Promise.resolve({
				data: body.operation === 'list_deployments' ? { deployments: [], total: 0 } : deployment,
			});
		});
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		queryClient.setQueryData(['entity-1', 'get_deployment', deployment.deployment_id], deployment);
		return render(
			<QueryClientProvider client={queryClient}>
				<DeploymentDetail deploymentId={deployment.deployment_id} />
			</QueryClientProvider>,
		);
	}
	const holds = (node: string, live: string, kept: string[]) => ({
		node,
		components: [{
			project: 'web',
			deployment_id: live,
			releases: kept.map((deployment_id) => ({ deployment_id, state: 'kept', at: 1, size: 1 })),
		}],
	});
	const rollBack = () =>
		screen.queryByRole('button', { name: /Roll back to this release/ }) as HTMLButtonElement | null;

	it('says where an attested CI deploy came from, and links its commit and run', () => {
		renderRecord({
			deployment_id: 'v2',
			project: 'web',
			status: 'success',
			source: {
				via: 'oidc',
				policy: 'web-main',
				repository: 'acme/web',
				sha: SHA,
				workflow_ref: 'acme/web/.github/workflows/deploy.yml@refs/heads/main',
				run_id: '77',
				run_attempt: '1',
			},
		}, { nodes: [holds('a', 'v2', [])] });

		expect(screen.getByText('Deployed from CI')).toBeTruthy();
		expect(screen.getByText('OIDC').getAttribute('title')).toMatch(/matched trust policy web-main/);
		expect(screen.getByRole('link', { name: SHA }).getAttribute('href')).toBe(
			`https://github.com/acme/web/commit/${SHA}`,
		);
		expect(screen.getByRole('link', { name: 'deploy.yml #77' }).getAttribute('href'))
			.toBe('https://github.com/acme/web/actions/runs/77/attempts/1');
		expect(screen.getByText('web-main')).toBeTruthy();
	});

	it("shows each node's certification, and says the receiving node's is not recorded", () => {
		renderRecord({
			deployment_id: 'v2',
			project: 'web',
			status: 'success',
			origin_node: 'host-a',
			peer_results: [
				{ node: 'b', status: 'success', activation: { activated: true, certification: 'certified' } },
				{ node: 'c', status: 'success', activation: { activated: true, certification: 'uncertified' } },
			],
		}, { nodes: [] });

		expect(screen.getByText(/^Certified: Its canary loaded the release/)).toBeTruthy();
		expect(screen.getByText(/^Not certified: It went out unchecked/).className).toContain('text-amber-600');
		expect(screen.getByText(/host-a, which received it, took the release first\. Its certification went only to/))
			.toBeTruthy();
	});

	it('says nothing about certification on a deploy that was not rolled out node by node', () => {
		renderRecord({
			deployment_id: 'v2',
			project: 'web',
			status: 'success',
			peer_results: [{ node: 'b', status: 'success' }],
		}, { nodes: [] });

		expect(screen.queryByText(/took the release first/)).toBeNull();
		expect(screen.queryByText(/certified/i)).toBeNull();
	});

	it('offers to go back to a release every node keeps', async () => {
		renderRecord({ deployment_id: 'v2', project: 'web', status: 'success' }, {
			nodes: [holds('a', 'v3', ['v2']), holds('b', 'v3', ['v2'])],
		});

		expect(await screen.findByText(/Every node holds this release/)).toBeTruthy();
		expect(rollBack()!.disabled).toBe(false);
	});

	it('goes back by the release an activation made live, not by the activation', async () => {
		renderRecord({ deployment_id: 'a1', project: 'web', status: 'success', activated_from: 'v2' }, {
			nodes: [holds('a', 'v3', ['v2'])],
		});

		expect(await screen.findByText(/Every node holds this release/)).toBeTruthy();
		expect(post).toHaveBeenCalledWith('/', { operation: 'list_releases', project: 'web', replicated: false });
	});

	it('names the nodes that no longer keep a release, and why, without offering to go back to it', async () => {
		renderRecord({
			deployment_id: 'v2',
			project: 'web',
			status: 'success',
			package_identifier: 'file:/srv/web',
		}, { nodes: [holds('a', 'v3', ['v2']), holds('b', 'v3', [])] });

		expect(await screen.findByText(/^b: it was deployed from a local directory, which no node keeps\.$/)).toBeTruthy();
		expect(rollBack()!.disabled).toBe(true);
	});

	it('offers nothing for the release live on every node', async () => {
		renderRecord({ deployment_id: 'v3', project: 'web', status: 'success' }, {
			nodes: [holds('a', 'v3', []), holds('b', 'v3', [])],
		});

		expect(await screen.findByText('Live on every node.')).toBeTruthy();
		expect(rollBack()).toBeNull();
		expect(screen.queryByRole('button', { name: /Activate/ })).toBeNull();
	});

	it('refuses to go back when the nodes cannot be asked', async () => {
		renderRecord({ deployment_id: 'v2', project: 'web', status: 'success' }, new Error('timed out'));

		expect(await screen.findByText(/Going back needs every node to hold it\./)).toBeTruthy();
		expect(rollBack()!.disabled).toBe(true);
	});

	it('offers no going back before Harper 5.4, which cannot say what each node keeps', () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(['entity-1', 'get_deployment', 'v2'], {
			deployment_id: 'v2',
			project: 'web',
			status: 'success',
		});
		render(
			<QueryClientProvider client={queryClient}>
				<DeploymentDetail deploymentId="v2" />
			</QueryClientProvider>,
		);
		expect(rollBack()).toBeNull();
		expect(post).not.toHaveBeenCalledWith('/', expect.objectContaining({ operation: 'list_releases' }));
	});
});
