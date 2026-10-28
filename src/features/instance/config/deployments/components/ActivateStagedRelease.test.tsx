/** @vitest-environment jsdom */
import { Deployment } from '@/integrations/api/instance/deployments/types';
import { SSEInconclusiveError } from '@/integrations/api/sse/errors';
import { UNANSWERED_WRITE_MESSAGE } from '@/integrations/api/unansweredWrite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	canStage: true,
	canBranch: false,
	currentBranches: { setting: undefined as string[] | true | undefined, known: false },
	mutateAsync: vi.fn(),
	reportDeployOutcome: vi.fn(),
	reportDeployFailure: vi.fn(),
	warning: vi.fn(),
	invalidateConfiguration: vi.fn(),
	useDeployComponentMutation: vi.fn(),
}));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ entityId: 'clu-a', entityType: 'cluster', instanceClient: {} }),
}));
vi.mock('@/features/instance/applications/hooks/useSupportsDeploymentSSE', () => ({
	useStagedDeploymentsAvailable: () => state.canStage,
	useSupportsDeploymentSSE: () => false,
}));
vi.mock('@/features/instance/applications/hooks/useBranchedDatabases', () => ({
	useBranchedDatabasesAvailable: () => state.canBranch,
	useApplicationBranchedDatabases: () => state.currentBranches,
	invalidateApplicationConfiguration: state.invalidateConfiguration,
}));
vi.mock('@/features/instance/applications/hooks/useComponentHealthCheck', () => ({
	useComponentHealthCheck: () => vi.fn(),
}));
vi.mock('@/features/instance/applications/hooks/useDeploymentRecordAction', () => ({
	useDeploymentRecordAction: () => () => undefined,
}));
vi.mock('@/features/instance/applications/components/DeployProgress/DeployProgress', () => ({
	DeployProgress: ({ state }: { state: { error?: string } }) => <div>{state.error ?? 'progress'}</div>,
}));
vi.mock('@/features/instance/applications/modals/reportDeployHealth', () => ({
	reportDeployOutcome: state.reportDeployOutcome,
	reportDeployFailure: state.reportDeployFailure,
}));
vi.mock('@/integrations/api/instance/applications/deployComponent', () => ({
	useDeployComponentMutation: (...args: unknown[]) => {
		state.useDeployComponentMutation(...args);
		return { mutateAsync: state.mutateAsync };
	},
}));
vi.mock('sonner', () => ({ toast: { warning: state.warning } }));

import { ActivateStagedRelease, activationMutationKey } from './ActivateStagedRelease';

const staged = {
	deployment_id: 'a1b2c3d4-0000-4000-8000-000000000001',
	project: 'web',
	status: 'staged',
} as Deployment;

function renderButton(queryClient = new QueryClient()) {
	return render(
		<QueryClientProvider client={queryClient}>
			<ActivateStagedRelease deployment={staged} />
		</QueryClientProvider>,
	);
}

function confirm() {
	fireEvent.click(screen.getByRole('button', { name: /Activate/ }));
	fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
}

afterEach(() => {
	cleanup();
	state.canStage = true;
	state.canBranch = false;
	state.currentBranches = { setting: undefined, known: false };
	vi.clearAllMocks();
});

describe('ActivateStagedRelease', () => {
	it('activates the staged release by its id, only once confirmed', () => {
		state.mutateAsync.mockReturnValue(new Promise(() => {}));
		renderButton();
		fireEvent.click(screen.getByRole('button', { name: /Activate/ }));
		expect(state.mutateAsync).not.toHaveBeenCalled();
		expect(screen.getByText('Activate this release of web?')).toBeTruthy();
		const description = screen.getByText(/Everything was installed when this release was staged/);
		expect(description.textContent).toMatch(/goes live on all nodes, which restart one at a time\./);
		expect(description.textContent).toMatch(/so each node just switches to it\.$/);

		fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
		expect(state.mutateAsync).toHaveBeenCalledOnce();
		expect(state.mutateAsync.mock.calls[0][0]).toMatchObject({
			request: { kind: 'activate', project: 'web', deploymentId: staged.deployment_id },
			entityType: 'cluster',
		});
	});

	it('adds, when activating it again, that a node already running it only restarts', () => {
		render(
			<QueryClientProvider client={new QueryClient()}>
				<ActivateStagedRelease deployment={staged} intent="again" />
			</QueryClientProvider>,
		);
		fireEvent.click(screen.getByRole('button', { name: 'Activate again' }));
		expect(screen.getByText('Activate this release of web again?')).toBeTruthy();
		const description = screen.getByText(/Everything was installed when this release was staged/);
		expect(description.textContent).toMatch(
			/so each node just switches to it\. A node already running it restarts without changing anything\.$/,
		);
	});

	it('still reports an activation whose detail was closed before it settled', async () => {
		let settle: (value: object) => void = () => {};
		state.mutateAsync.mockReturnValue(new Promise((resolve) => (settle = resolve)));
		const { unmount } = renderButton();
		confirm();
		unmount();
		await act(async () => settle({ message: 'ok', deployment_id: 'd2' }));
		expect(state.reportDeployOutcome).toHaveBeenCalledWith(
			'web',
			{ message: 'ok', deployment_id: 'd2' },
			expect.any(Function),
			{
				action: undefined,
			},
		);
	});

	it('does not offer a second activation of a release that is still being activated', async () => {
		const queryClient = new QueryClient();
		void queryClient.getMutationCache().build(queryClient, {
			mutationKey: activationMutationKey('clu-a', staged.deployment_id),
			mutationFn: () => new Promise(() => {}),
		}).execute(undefined);
		renderButton(queryClient);
		expect((await screen.findByRole('button', { name: /Activating/ }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('says the outcome is unknown, not that it failed, when live updates end early', async () => {
		state.mutateAsync.mockRejectedValue(new SSEInconclusiveError('idle'));
		renderButton();
		confirm();
		await vi.waitFor(() => expect(state.warning).toHaveBeenCalledWith('web may not be activated', expect.anything()));
		expect(state.reportDeployFailure).not.toHaveBeenCalled();
	});

	// The mutation files the Datadog report (deployComponent.test.ts); a second one here would double it.
	it('reports every failure itself, and leaves the Datadog report to the mutation', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const failure = new Error('No deployment found with id a1b2c3d4');
		state.mutateAsync.mockRejectedValue(failure);
		renderButton();
		expect(state.useDeployComponentMutation).toHaveBeenCalledWith(activationMutationKey('clu-a', staged.deployment_id));
		confirm();
		await vi.waitFor(() =>
			expect(state.reportDeployFailure).toHaveBeenCalledWith('web', failure, 'activate', { action: undefined })
		);
		expect(consoleError).not.toHaveBeenCalledWith(failure);
		consoleError.mockRestore();
	});

	it('says in its progress panel that an activation with no verdict may have gone through', async () => {
		const sent = { method: 'post', data: '{"operation":"deploy_component"}' } as InternalAxiosRequestConfig;
		const unanswered = new AxiosError('timeout of 300000ms exceeded', AxiosError.ECONNABORTED, sent);
		state.mutateAsync.mockRejectedValue(unanswered);
		renderButton();
		confirm();
		expect(await screen.findByText(UNANSWERED_WRITE_MESSAGE)).toBeTruthy();
		expect(state.reportDeployFailure).toHaveBeenCalledWith('web', unanswered, 'activate', { action: undefined });
	});

	it('offers nothing where staging is not known to exist', () => {
		state.canStage = false;
		renderButton();
		expect(screen.queryByRole('button', { name: /Activate/ })).toBeNull();
	});

	it('says the release brings back its own private database copy setting, and what runs now', () => {
		state.mutateAsync.mockReturnValue(new Promise(() => {}));
		state.canBranch = true;
		state.currentBranches = { setting: ['data'], known: true };
		renderButton();
		fireEvent.click(screen.getByRole('button', { name: /Activate/ }));

		expect(screen.getByText(/brings back the private database copy setting this release was deployed with/))
			.toBeTruthy();
		expect(screen.getByText(/web now runs on a private copy of data\./)).toBeTruthy();
	});

	it("tells someone who can't configure private copies that the release brings back its own setting", () => {
		renderButton();
		fireEvent.click(screen.getByRole('button', { name: /Activate/ }));

		expect(screen.getByText(/brings back the private database copy setting this release was deployed with/))
			.toBeTruthy();
		expect(screen.queryByText(/now runs on/)).toBeNull();
	});

	it.each([
		['activated', () => state.mutateAsync.mockResolvedValue({ message: 'ok' })],
		['failed, since it may still have gone through', () => state.mutateAsync.mockRejectedValue(new Error('timeout'))],
	])('re-reads the setting once the release is %s', async (_, settle) => {
		settle();
		const queryClient = new QueryClient();
		renderButton(queryClient);

		confirm();

		await vi.waitFor(() => expect(state.invalidateConfiguration).toHaveBeenCalledWith(queryClient, 'clu-a'));
	});
});
