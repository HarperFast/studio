/** @vitest-environment jsdom */
import { Deployment } from '@/integrations/api/instance/deployments/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	history: [] as object[] | Error | 'pending',
	post: vi.fn(),
	mutateAsync: vi.fn(),
}));
vi.mock('@/config/useInstanceClient', () => {
	const params = { entityId: 'clu-a', entityType: 'cluster', instanceClient: { post: state.post } };
	return { useInstanceClientIdParams: () => params };
});
vi.mock('@tanstack/react-router', () => {
	const params = { organizationId: 'org-a', clusterId: 'clu-a' };
	return {
		Link: ({ children, to, title }: { children?: ReactNode; to?: string; title?: string }) => (
			<a href={to} title={title}>{children}</a>
		),
		useParams: () => params,
	};
});
vi.mock('@/features/instance/applications/hooks/useSupportsDeploymentSSE', () => ({
	useStagedDeploymentsAvailable: () => true,
	useSupportsDeploymentSSE: () => false,
}));
vi.mock('@/features/instance/applications/hooks/useComponentHealthCheck', () => ({
	useComponentHealthCheck: () => vi.fn(),
}));
vi.mock('@/features/instance/applications/hooks/useDeploymentRecordAction', async (importOriginal) => ({
	...await importOriginal<typeof import('@/features/instance/applications/hooks/useDeploymentRecordAction')>(),
	useDeploymentRecordAction: () => () => undefined,
}));
vi.mock('@/features/instance/applications/components/DeployProgress/DeployProgress', () => ({
	DeployProgress: () => <div>activation progress</div>,
}));
vi.mock('@/features/instance/applications/modals/reportDeployHealth', () => ({
	reportDeployOutcome: vi.fn(),
	reportDeployFailure: vi.fn(),
}));
vi.mock('@/integrations/api/instance/applications/deployComponent', () => ({
	useDeployComponentMutation: () => ({ mutateAsync: state.mutateAsync }),
}));
vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }));

import { StagedReleaseDetail } from './StagedReleaseDetail';

const STAGED_ID = '4ac92da3-d8a0-423e-b145-5df107957dd4';
const ACTIVATION_ID = '5c12b89e-1111-4000-8000-000000000001';
const staged: Deployment = { deployment_id: STAGED_ID, project: 'hello', status: 'staged', started_at: 100 };
const activation: Deployment = {
	deployment_id: ACTIVATION_ID,
	project: 'hello',
	status: 'success',
	started_at: 200,
	activated_from: STAGED_ID,
};
const later: Deployment = {
	deployment_id: '9f00aa11-2222-4000-8000-000000000002',
	project: 'hello',
	status: 'success',
	started_at: 300,
};

state.post.mockImplementation(() => {
	const { history } = state;
	if (history === 'pending') {
		return new Promise(() => {});
	}
	return history instanceof Error
		? Promise.reject(history)
		: Promise.resolve({ data: { deployments: history, total: history.length } });
});

afterEach(() => {
	cleanup();
	state.history = [];
	state.post.mockClear();
	state.mutateAsync.mockReset();
});

function renderDetail(history: typeof state.history) {
	state.history = history;
	const queryClient = new QueryClient();
	render(
		<QueryClientProvider client={queryClient}>
			<StagedReleaseDetail deployment={staged} />
		</QueryClientProvider>,
	);
	return queryClient;
}

/** Confirms an activation here, then settles it once the records read `historyAfter`. */
async function activateHere(outcome: { resolve: object } | { reject: Error }, historyAfter: typeof state.history) {
	let settle: (value: object) => void = () => {};
	let fail: (error: Error) => void = () => {};
	state.mutateAsync.mockReturnValue(
		new Promise((resolve, reject) => {
			settle = resolve;
			fail = reject;
		}),
	);
	fireEvent.click(await screen.findByRole('button', { name: /Activate/ }));
	fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
	state.history = historyAfter;
	await act(async () => ('resolve' in outcome ? settle(outcome.resolve) : fail(outcome.reject)));
}

const activationButton = () => screen.queryByRole('button', { name: /Activate|Roll back/ });

describe('StagedReleaseDetail', () => {
	it("reads the component's records from the staged one on, wherever they are listed", async () => {
		renderDetail([staged]);
		await screen.findByText(/Staged: built and installed, but not live/);
		expect(state.post).toHaveBeenCalledWith(
			'/',
			expect.objectContaining({
				operation: 'list_deployments',
				project: 'hello',
				since: 100,
				limit: undefined,
			}),
		);
		expect(activationButton()?.textContent).toContain('Activate');
	});

	it('says an activated release is live, links its activation, and does not offer to activate it again', async () => {
		renderDetail([activation, staged]);
		expect(await screen.findByText(/Live: activated by/)).toBeTruthy();
		const link = screen.getByRole('link', { name: '5c12b89e' });
		expect(link.getAttribute('href')).toBe(`/org-a/clu-a/config/deployments/${ACTIVATION_ID}`);
		expect(screen.queryByText(/but not live/)).toBeNull();
		expect(activationButton()).toBeNull();
	});

	it('offers a replaced release as a rollback, and says so before it runs', async () => {
		state.mutateAsync.mockReturnValue(new Promise(() => {}));
		renderDetail([later, activation, staged]);
		expect(await screen.findByText(/then replaced by/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: /Roll back to this release/ }));
		expect(screen.getByText('Roll hello back to this release?')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Roll back to this release' }));
		expect(state.mutateAsync.mock.calls[0][0]).toMatchObject({
			request: { kind: 'activate', project: 'hello', deploymentId: STAGED_ID },
		});
	});

	it('offers to activate it again when a later deploy failed and may have replaced it somewhere', async () => {
		renderDetail([{ ...later, status: 'failed' }, activation, staged]);
		expect(await screen.findByText(/may not be live everywhere/)).toBeTruthy();
		expect(activationButton()?.textContent).toContain('Activate again');
	});

	it('says when someone else is activating it, and what another activation would do', async () => {
		renderDetail([{ ...activation, status: 'restarting' }, staged]);
		const note = await screen.findByText(/Being activated by/);
		expect(note.textContent).toMatch(/which started .+ and has not finished/);
		expect(note.textContent).toMatch(/While it runs, activating it again starts a second rolling restart/);
		expect(note.textContent).toMatch(/If it stopped without finishing, activate it again/);
		expect(screen.queryByText(/but not live/)).toBeNull();
		expect(activationButton()?.textContent).toContain('Activate again');
	});

	it('offers nothing until it knows, rather than an Activate that may restart the cluster for nothing', () => {
		renderDetail('pending');
		expect(screen.getByText(/Checking whether it has been activated/)).toBeTruthy();
		expect(activationButton()).toBeNull();
	});

	it("still offers Activate when the records after it can't be read, and says what that risks", async () => {
		renderDetail(new Error('unreachable'));
		expect(await screen.findByText(/Couldn't read the deployments since, so it may already be live/)).toBeTruthy();
		expect(activationButton()?.textContent).toContain('Activate');
	});

	it('keeps what it read when a later poll fails, rather than offering to activate a live release', async () => {
		const queryClient = renderDetail([activation, staged]);
		expect(await screen.findByText(/Live: activated by/)).toBeTruthy();
		state.history = new Error('blip');
		await act(() => queryClient.refetchQueries());
		const [history] = queryClient.getQueryCache().findAll({ queryKey: ['clu-a', 'list_deployments'] });
		expect(history.state.status).toBe('error');
		// Let the failed poll's update reach the component before reading it.
		await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
		expect(screen.getByText(/Live: activated by/)).toBeTruthy();
		expect(activationButton()).toBeNull();
	});

	it('keeps showing the progress of an activation started here once the release turns out live', async () => {
		renderDetail([staged]);
		await activateHere({ resolve: { message: 'ok', deployment_id: ACTIVATION_ID } }, [activation, staged]);

		expect(await screen.findByText(/Live: activated by/)).toBeTruthy();
		expect(screen.getByText('activation progress')).toBeTruthy();
		expect(activationButton()).toBeNull();
	});

	it('stops offering Activate once it succeeded here, before the records catch up', async () => {
		renderDetail([staged]);
		await activateHere({ resolve: { message: 'ok', deployment_id: ACTIVATION_ID } }, 'pending');
		expect(screen.getByText('activation progress')).toBeTruthy();
		expect(activationButton()).toBeNull();
	});

	// Only the node that received it writes the record, which reads `success` after the rolling restart fails elsewhere.
	it('keeps offering to activate it again after it failed here, even once the record reads success', async () => {
		renderDetail([staged]);
		await activateHere({ reject: new Error('node b did not restart') }, [activation, staged]);
		expect(await screen.findByText(/Live: activated by/)).toBeTruthy();
		expect(activationButton()?.textContent).toContain('Activate again');
	});
});
