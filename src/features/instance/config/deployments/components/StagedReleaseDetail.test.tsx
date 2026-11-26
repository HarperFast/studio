/** @vitest-environment jsdom */
import { Deployment } from '@/integrations/api/instance/deployments/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	history: [] as object[] | Error | 'pending',
	rolling: undefined as object[] | Error | 'pending' | undefined,
	releases: undefined as object | Error | undefined,
	post: vi.fn(),
	mutateAsync: vi.fn(),
	canListReleases: true,
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
	useReleaseTrackingAvailable: () => state.releases !== undefined,
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
vi.mock('@/hooks/useInstanceOperationPermission', () => ({
	useInstanceOperationPermission: () => true,
	useInstanceOperationAccess: (operation: string) => operation !== 'list_releases' || state.canListReleases,
}));

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

state.post.mockImplementation((_url: string, body: { operation: string; status?: string }) => {
	if (body.operation === 'list_releases') {
		return state.releases instanceof Error ? Promise.reject(state.releases) : Promise.resolve({ data: state.releases });
	}
	const { rolling } = state;
	if (body.status === 'rolling_out' && rolling) {
		return rolling === 'pending'
			? new Promise(() => {})
			: rolling instanceof Error
			? Promise.reject(rolling)
			: Promise.resolve({ data: { deployments: rolling, total: rolling.length } });
	}
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
	state.rolling = undefined;
	state.releases = undefined;
	state.canListReleases = true;
	state.post.mockClear();
	state.mutateAsync.mockReset();
});

function renderDetail(history: typeof state.history, deployment = staged) {
	state.history = history;
	const queryClient = new QueryClient();
	render(
		<QueryClientProvider client={queryClient}>
			<StagedReleaseDetail deployment={deployment} />
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
	it('tells the activation what its record says the release puts back (harper#4077)', async () => {
		const routed: Deployment = {
			...staged,
			routing: { host: null, urlPath: null, isolated: null, branchedDatabases: ['data'] },
		};
		renderDetail([routed], routed);
		fireEvent.click(await screen.findByRole('button', { name: /Activate/ }));
		expect(screen.getByText(/It puts hello on a private copy of data\./)).toBeTruthy();
	});

	it("reads the component's records from the staged one on, wherever they are listed", async () => {
		renderDetail([staged]);
		await screen.findByText('Staged: built and installed, but not live. Activating it just switches each node to it.');
		expect(state.post).toHaveBeenCalledWith(
			'/',
			expect.objectContaining({
				operation: 'list_deployments',
				project: 'hello',
				since: 100,
				limit: undefined,
			}),
		);
		expect(state.post).not.toHaveBeenCalledWith('/', expect.objectContaining({ status: 'rolling_out' }));
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
		const description = screen.getByText(/Each node kept this release installed when it was replaced/);
		expect(description.textContent).toMatch(/goes live again on all nodes, which restart one at a time\./);
		expect(description.textContent).toMatch(/so it just switches back\. A node that no longer keeps it refuses\.$/);
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

	it('says a later rolling deploy that ended partial went live on only some nodes', async () => {
		renderDetail([{ ...later, status: 'partial' }, activation, staged]);
		expect(await screen.findByText(/went live on only some nodes, so it may not be live everywhere/)).toBeTruthy();
		expect(screen.queryByText(/failed and may have gone live/)).toBeNull();
		expect(activationButton()?.textContent).toContain('Activate again');
	});

	it('offers to activate it again when its own rolling activation ended partial', async () => {
		renderDetail([{ ...activation, status: 'partial' }, staged]);
		expect(await screen.findByText(/but some nodes did not take it, so it may not be live everywhere/)).toBeTruthy();
		expect(activationButton()?.textContent).toContain('Activate again');
	});

	it('says a later deploy rolling out is taking over rather than that it is live, and offers no activation', async () => {
		renderDetail([{ ...later, status: 'rolling_out' }, activation, staged]);
		const note = await screen.findByText(/is taking over/);
		expect(note.textContent).toBe(
			'Activated by 5c12b89e, but a later deploy, 9f00aa11, is taking over: it went live on the node that received it'
				+ ' and is reaching the other nodes one at a time.',
		);
		expect(screen.getByText(/finishes rolling out/).textContent).toBe(
			'Until 9f00aa11 finishes rolling out, activating this release would start a second rolling activation'
				+ " alongside it, so it isn't offered.",
		);
		for (const link of screen.getAllByRole('link', { name: '9f00aa11' })) {
			expect(link.getAttribute('href')).toBe(`/org-a/clu-a/config/deployments/${later.deployment_id}`);
		}
		expect(screen.queryByText(/Live: activated by/)).toBeNull();
		expect(activationButton()).toBeNull();
	});

	it('offers no activation in any state while another deploy rolls out, and says why instead', async () => {
		const rolling: Deployment = { ...later, deployment_id: 'ab0de000-3333-4000-8000-000000000003', started_at: 400 };
		const rollingOut = { ...rolling, status: 'rolling_out' } as Deployment;
		const states: Array<[string, Deployment[], RegExp, RegExp]> = [
			['waiting', [rollingOut, staged], /^Staged: built and installed, but not live\.$/, /switches each node/],
			['replaced', [rollingOut, later, activation, staged], /then replaced by/, /rolls hello back/],
			[
				'activating',
				[
					rollingOut,
					{
						...activation,
						deployment_id: 'c0c0c0c0-4444-4000-8000-000000000004',
						status: 'restarting',
						started_at: 250,
					},
					activation,
					staged,
				],
				/Being activated by/,
				/If it stopped without finishing/,
			],
			[
				'uncertain',
				[rollingOut, { ...activation, status: 'failed' }, staged],
				/^Its activation,.*failed\. Depending on where it failed/,
				/retries it/,
			],
		];
		for (const [kind, history, says, advice] of states) {
			renderDetail(history);
			expect(await screen.findByText(says), kind).toBeTruthy();
			expect(screen.queryByText(advice), kind).toBeNull();
			expect(screen.getByText(/finishes rolling out/).textContent, kind).toMatch(
				/^Until ab0de000 finishes rolling out/,
			);
			expect(activationButton(), kind).toBeNull();
			cleanup();
		}
	});

	it('says nothing of a rollout when there is nothing to offer anyway', async () => {
		const older = {
			...later,
			deployment_id: 'ab0de000-8888-4000-8000-000000000008',
			status: 'rolling_out',
			started_at: 150,
		};
		renderDetail([older, activation, staged] as Deployment[]);
		expect(await screen.findByText(/^Live: activated by/)).toBeTruthy();
		expect(screen.queryByText(/finishes rolling out/)).toBeNull();
		expect(activationButton()).toBeNull();
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

	it('refuses a retry of an activation that failed here while another deploy rolls out', async () => {
		renderDetail([staged]);
		const rolling = { ...later, deployment_id: 'ab0de000-6666-4000-8000-000000000006', status: 'rolling_out' };
		await activateHere({ reject: new Error('node b did not restart') }, [rolling, staged]);
		expect((await screen.findByText(/finishes rolling out/)).textContent).toMatch(
			/^Until ab0de000 finishes rolling out/,
		);
		const button = activationButton() as HTMLButtonElement;
		expect(button.textContent).toContain('Activate again');
		expect(button.disabled).toBe(true);
	});
});

describe('StagedReleaseDetail on Harper 5.4, where each node says what it holds', () => {
	const holding = (node: string, live: string | undefined, kept: Array<[string, 'staged' | 'kept']>) => ({
		node,
		components: [{
			project: 'hello',
			...(live && { deployment_id: live }),
			releases: kept.map(([deployment_id, state]) => ({ deployment_id, state, at: 1, size: 1 })),
		}],
	});

	it('refuses to activate a release some node no longer holds, and says which and why', async () => {
		state.releases = {
			nodes: [holding('a', later.deployment_id, [[STAGED_ID, 'staged']]), holding('b', undefined, [])],
		};
		renderDetail([staged]);
		expect(await screen.findByText(/This needs every node to hold the release, and some do not/)).toBeTruthy();
		expect(screen.getByText(/^b: it isn't kept there: it was made live before Harper 5\.3, retention pruned it/))
			.toBeTruthy();
		expect((activationButton() as HTMLButtonElement).disabled).toBe(true);
		expect(screen.queryByText(/just switches each node/)).toBeNull();
		expect(state.post).toHaveBeenCalledWith('/', { operation: 'list_releases', project: 'hello', replicated: true });
	});

	it('says once, from the nodes, what activating a release every node holds does', async () => {
		state.releases = {
			nodes: [
				holding('a', later.deployment_id, [[STAGED_ID, 'staged']]),
				holding('b', later.deployment_id, [[STAGED_ID, 'staged']]),
			],
		};
		renderDetail([staged]);
		expect(await screen.findByText(/^Every node holds this release/)).toBeTruthy();
		expect(screen.getByText(/^Staged: built and installed, but not live\.$/)).toBeTruthy();
		expect(screen.getAllByText(/switches each/)).toHaveLength(1);
	});

	it('offers to activate it again where it is live on only some nodes, though the records say it is live', async () => {
		state.releases = {
			nodes: [holding('a', STAGED_ID, []), holding('b', later.deployment_id, [[STAGED_ID, 'staged']])],
		};
		renderDetail([activation, staged]);
		expect(await screen.findByText(/^Live on a\. The other nodes hold it/)).toBeTruthy();
		expect(screen.queryByText(/nothing to activate/)).toBeNull();
		const button = activationButton() as HTMLButtonElement;
		expect(button.textContent).toContain('Activate again');
		expect(button.disabled).toBe(false);
	});

	it('offers no rollback of a replaced release while another deploy rolls out, though every node holds it', async () => {
		const runsLater = (node: string) => holding(node, later.deployment_id, [[STAGED_ID, 'kept']]);
		state.releases = { nodes: [runsLater('a'), runsLater('b')] };
		const rolling = {
			...later,
			deployment_id: 'ab0de000-7777-4000-8000-000000000007',
			status: 'rolling_out',
			started_at: 400,
		};
		renderDetail([rolling, later, activation, staged]);
		// The nodes' note says what they hold, without advising the activation the rollout withholds.
		expect(await screen.findByText(/^Every node holds this release\.$/)).toBeTruthy();
		expect(screen.getByText(/then replaced by/)).toBeTruthy();
		expect(screen.getByText(/finishes rolling out/).textContent).toMatch(/^Until ab0de000 finishes rolling out/);
		expect(activationButton()).toBeNull();
		cleanup();

		state.releases = { nodes: [runsLater('a'), holding('b', STAGED_ID, [])] };
		renderDetail([rolling, later, activation, staged]);
		expect(await screen.findByText(/^Live on b\. The other nodes hold it\.$/)).toBeTruthy();
		expect(screen.queryByText(/then replaced by/)).toBeNull();
		expect(screen.getByText(/finishes rolling out/).textContent).toMatch(/^Until ab0de000 finishes rolling out/);
		expect(activationButton()).toBeNull();
	});

	describe('asking by status for the rollouts that began before it was staged', () => {
		const holdsIt = (node: string) => holding(node, later.deployment_id, [[STAGED_ID, 'staged']]);
		const before: Deployment = {
			...later,
			deployment_id: 'ab0de000-5555-4000-8000-000000000005',
			status: 'rolling_out',
			started_at: 50,
		};

		it('waits one out', async () => {
			state.releases = { nodes: [holdsIt('a'), holdsIt('b')] };
			state.rolling = [before];
			renderDetail([staged]);
			expect((await screen.findByText(/finishes rolling out/)).textContent).toMatch(
				/^Until ab0de000 finishes rolling out/,
			);
			expect(await screen.findByText(/^Every node holds this release\.$/)).toBeTruthy();
			expect(activationButton()).toBeNull();
			expect(state.post).toHaveBeenCalledWith(
				'/',
				expect.objectContaining({
					operation: 'list_deployments',
					project: 'hello',
					status: 'rolling_out',
					since: undefined,
				}),
			);
		});

		it('enables nothing until that list has answered', async () => {
			state.releases = { nodes: [holdsIt('a'), holdsIt('b')] };
			state.rolling = 'pending';
			renderDetail([staged]);
			expect(await screen.findByText(/^Every node holds this release/)).toBeTruthy();
			expect((activationButton() as HTMLButtonElement).disabled).toBe(true);
			cleanup();

			state.rolling = new Error('list_deployments timed out');
			const queryClient = renderDetail([staged]);
			expect(await screen.findByText(/^Couldn't ask whether another deploy of hello is rolling out/)).toBeTruthy();
			expect((activationButton() as HTMLButtonElement).disabled).toBe(true);
			const [rollouts] = queryClient.getQueryCache().findAll({
				predicate: (query) => query.queryKey.some((part) => (part as { status?: string })?.status === 'rolling_out'),
			});
			expect(rollouts.meta).toEqual({ reportsOwnFailure: true });
		});

		it('enables nothing again once a later read of that list fails', async () => {
			state.releases = { nodes: [holdsIt('a'), holdsIt('b')] };
			state.rolling = [];
			const queryClient = renderDetail([staged]);
			expect(await screen.findByText(/^Every node holds this release/)).toBeTruthy();
			await vi.waitFor(() => expect((activationButton() as HTMLButtonElement).disabled).toBe(false));

			state.rolling = new Error('list_deployments timed out');
			await act(() => queryClient.refetchQueries());
			expect(await screen.findByText(/^Couldn't ask whether another deploy of hello is rolling out/)).toBeTruthy();
			expect((activationButton() as HTMLButtonElement).disabled).toBe(true);
		});

		it('leaves a rollout from this release on to the records, which a stale answer cannot bring back', async () => {
			const runsLater = (node: string) => holding(node, later.deployment_id, [[STAGED_ID, 'kept']]);
			state.releases = { nodes: [runsLater('a'), runsLater('b')] };
			state.rolling = [{ ...later, status: 'rolling_out' }];
			renderDetail([later, activation, staged]);
			expect(await screen.findByText(/^Every node holds this release/)).toBeTruthy();
			expect(screen.getByText(/then replaced by/)).toBeTruthy();
			await vi.waitFor(() => expect((activationButton() as HTMLButtonElement).disabled).toBe(false));
			expect(activationButton()?.textContent).toContain('Roll back to this release');
			expect(screen.queryByText(/finishes rolling out/)).toBeNull();
		});

		it('asks again before confirming, and refuses once a rollout has started', async () => {
			state.releases = { nodes: [holdsIt('a'), holdsIt('b')] };
			state.rolling = [];
			renderDetail([staged]);
			expect(await screen.findByText(/^Every node holds this release/)).toBeTruthy();
			await vi.waitFor(() => expect((activationButton() as HTMLButtonElement).disabled).toBe(false));
			state.rolling = [before];

			// The props catch up a render after the answer, and would close a confirmation that had opened.
			let confirmationOpened = false;
			const observer = new MutationObserver((mutations) => {
				confirmationOpened ||= mutations.some((mutation) =>
					[...mutation.addedNodes].some((node) => node.textContent?.includes('Activate this release of hello?'))
				);
			});
			observer.observe(document.body, { childList: true, subtree: true });
			fireEvent.click(activationButton()!);
			expect((await screen.findByText(/finishes rolling out/)).textContent).toMatch(/^Until ab0de000/);
			await vi.waitFor(() => expect(screen.queryByRole('button', { name: /Checking/ })).toBeNull());
			await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
			observer.disconnect();
			expect(confirmationOpened).toBe(false);
			expect(state.mutateAsync).not.toHaveBeenCalled();
		});
	});

	it('offers no activation while a later deploy rolls out, wherever the nodes say this release is live', async () => {
		state.releases = {
			nodes: [holding('a', later.deployment_id, [[STAGED_ID, 'kept']]), holding('b', STAGED_ID, [])],
		};
		renderDetail([{ ...later, status: 'rolling_out' }, activation, staged]);
		// The nodes' note says what they hold, without advising the activation the detail withholds.
		expect(await screen.findByText(/^Live on b\. The other nodes hold it\.$/)).toBeTruthy();
		expect(screen.getByText(/is taking over: it went live on the node that received it/)).toBeTruthy();
		expect(screen.queryByText(/activating it again makes it live/)).toBeNull();
		expect(activationButton()).toBeNull();
		cleanup();

		const runsLater = (node: string) => holding(node, later.deployment_id, [[STAGED_ID, 'kept']]);
		state.releases = { nodes: [runsLater('a'), runsLater('b')] };
		renderDetail([{ ...later, status: 'rolling_out' }, activation, staged]);
		expect(await screen.findByText(/^Every node holds this release\.$/)).toBeTruthy();
		expect(screen.getByText(/is taking over/)).toBeTruthy();
		expect(screen.queryByText(/switches each one to it/)).toBeNull();
		expect(activationButton()).toBeNull();
	});

	it("drops the records' claim that it is live where the nodes report it live on none", async () => {
		state.releases = {
			nodes: [
				holding('a', later.deployment_id, [[STAGED_ID, 'kept']]),
				holding('b', later.deployment_id, [[STAGED_ID, 'kept']]),
			],
		};
		renderDetail([activation, staged]);
		expect(await screen.findByText(/Every node holds this release/)).toBeTruthy();
		expect(screen.queryByText(/nothing to activate/)).toBeNull();
		expect((activationButton() as HTMLButtonElement).disabled).toBe(false);
	});

	it('offers nothing for a release live on every node, though the records say a later deploy failed', async () => {
		state.releases = { nodes: [holding('a', STAGED_ID, []), holding('b', STAGED_ID, [])] };
		renderDetail([{ ...later, status: 'failed' }, activation, staged]);
		expect(await screen.findByText(/^Live on every node\./)).toBeTruthy();
		expect(screen.queryByText(/may not be live everywhere/)).toBeNull();
		expect(activationButton()).toBeNull();
	});

	it('asks the nodes again before confirming, and refuses once a node that joined since has no copy', async () => {
		const holdsIt = (node: string) => holding(node, later.deployment_id, [[STAGED_ID, 'staged']]);
		state.releases = { nodes: [holdsIt('a'), holdsIt('b')] };
		renderDetail([staged]);
		expect(await screen.findByText(/^Every node holds this release/)).toBeTruthy();
		state.releases = { nodes: [holdsIt('a'), holdsIt('b'), holding('c', later.deployment_id, [])] };

		fireEvent.click(activationButton()!);
		expect(await screen.findByText(/^c: it isn't kept there/)).toBeTruthy();
		await vi.waitFor(() => expect(screen.queryByRole('button', { name: /Checking/ })).toBeNull());
		await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
		expect((activationButton() as HTMLButtonElement).disabled).toBe(true);
		expect(screen.queryByText('Activate this release of hello?')).toBeNull();
		expect(state.mutateAsync).not.toHaveBeenCalled();
	});

	it('offers no activation to a role that may not ask the nodes, though the records would allow one', async () => {
		state.canListReleases = false;
		state.releases = { nodes: [] };
		renderDetail([staged]);
		expect(await screen.findByText(/^Staged: built and installed, but not live\.$/)).toBeTruthy();
		expect(activationButton()).toBeNull();
		expect(state.post).not.toHaveBeenCalledWith('/', expect.objectContaining({ operation: 'list_releases' }));
	});

	it("shows, but refuses, the activation when the nodes can't be asked", async () => {
		state.releases = new Error('list_releases timed out');
		renderDetail([staged]);
		expect(await screen.findByText(/Nothing here is enabled until every node says it holds the release\./))
			.toBeTruthy();
		expect((activationButton() as HTMLButtonElement).disabled).toBe(true);
	});
});
