/** @vitest-environment jsdom */
import { Deployment } from '@/integrations/api/instance/deployments/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ canStage: true, mutate: vi.fn() }));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ entityId: 'clu-a', entityType: 'cluster', instanceClient: {} }),
}));
vi.mock('@/features/instance/applications/hooks/useSupportsDeploymentSSE', () => ({
	useStagedDeploymentsAvailable: () => state.canStage,
	useSupportsDeploymentSSE: () => false,
}));
vi.mock('@/features/instance/applications/hooks/useComponentHealthCheck', () => ({
	useComponentHealthCheck: () => vi.fn(),
}));
vi.mock('@/features/instance/applications/hooks/useDeploymentRecordAction', () => ({
	useDeploymentRecordAction: () => () => undefined,
}));
vi.mock('@/features/instance/applications/components/DeployProgress/DeployProgress', () => ({
	DeployProgress: () => <div>progress</div>,
}));
vi.mock('@/integrations/api/instance/applications/deployComponent', () => ({
	useDeployComponentMutation: () => ({ mutate: state.mutate, isPending: false }),
}));

import { ActivateStagedRelease } from './ActivateStagedRelease';

const staged = {
	deployment_id: 'a1b2c3d4-0000-4000-8000-000000000001',
	project: 'web',
	status: 'staged',
} as Deployment;

function renderButton() {
	render(
		<QueryClientProvider client={new QueryClient()}>
			<ActivateStagedRelease deployment={staged} />
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
	state.canStage = true;
	state.mutate.mockClear();
});

describe('ActivateStagedRelease', () => {
	it('activates the staged release by its id, only once confirmed', () => {
		renderButton();
		fireEvent.click(screen.getByRole('button', { name: /Activate/ }));
		expect(state.mutate).not.toHaveBeenCalled();
		expect(screen.getByText('Activate this release of web?')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
		expect(state.mutate).toHaveBeenCalledOnce();
		expect(state.mutate.mock.calls[0][0]).toMatchObject({
			request: { kind: 'activate', project: 'web', deploymentId: staged.deployment_id },
			entityType: 'cluster',
		});
	});

	it('offers nothing where staging is not known to exist', () => {
		state.canStage = false;
		renderButton();
		expect(screen.queryByRole('button', { name: /Activate/ })).toBeNull();
	});
});
