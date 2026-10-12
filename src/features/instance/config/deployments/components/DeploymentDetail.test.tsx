/**
 * @vitest-environment jsdom
 */
import { Deployment } from '@/integrations/api/instance/deployments/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeploymentDetail } from './DeploymentDetail';

vi.mock('@/config/useInstanceClient', () => {
	const params = { instanceClient: { post: vi.fn() }, entityId: 'entity-1', entityType: 'instance' };
	return { useInstanceClientIdParams: () => params };
});
vi.mock('@/features/instance/applications/hooks/useSupportsDeploymentSSE', () => ({
	useSupportsDeploymentSSE: () => false,
}));
vi.mock('@tanstack/react-router', () => {
	const params = {};
	return { useParams: () => params, Link: () => null };
});

afterEach(cleanup);

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
