/**
 * @vitest-environment jsdom
 */
import { DeployProgress } from '@/features/instance/applications/components/DeployProgress/DeployProgress';
import { DeploymentStreamState } from '@/features/instance/applications/components/DeployProgress/useDeploymentStream';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Only routing is stubbed (no RouterProvider in this unit test); the link target is built by the
// real `buildAbsoluteLinkToPage` from these params.
vi.mock('@tanstack/react-router', () => ({
	Link: ({ children, to, onClick }: { children?: ReactNode; to?: string; onClick?: () => void }) => (
		<a href={to} onClick={onClick}>{children}</a>
	),
	useParams: () => ({ organizationId: 'org-1', instanceId: 'ins-1' }),
}));

const SSH_FAILURE = 'Failed to deploy private repository git@github.com:acme-corp/billing-service.git: SSH access '
	+ 'failed. Verify the repository URL, configure an SSH key on this Harper instance, ensure the key has access to '
	+ 'the target repository, and confirm the host is present in the ssh/known_hosts file.';

function failedState(error: string): DeploymentStreamState {
	return { lifecycle: 'error', phases: { prepare: 'error' }, installLog: [], peers: [], error };
}

afterEach(cleanup);

describe('DeployProgress', () => {
	it("shows Harper's guidance and a link to SSH keys when a private repo deploy fails on SSH", () => {
		render(<DeployProgress state={failedState(SSH_FAILURE)} />);

		expect(screen.getByText(SSH_FAILURE)).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Manage SSH keys' }).getAttribute('href'))
			.toBe('/org-1/instance/ins-1/config/ssh-keys');
	});

	it('lets a hosting modal close itself before the guidance link navigates', () => {
		const onNavigateAway = vi.fn();
		render(<DeployProgress state={failedState(SSH_FAILURE)} onNavigateAway={onNavigateAway} />);

		fireEvent.click(screen.getByRole('link', { name: 'Manage SSH keys' }));
		expect(onNavigateAway).toHaveBeenCalledOnce();
	});

	it('does not offer SSH guidance for unrelated deploy failures', () => {
		render(<DeployProgress state={failedState('npm install failed with exit code 1')} />);

		expect(screen.getByText('npm install failed with exit code 1')).toBeTruthy();
		expect(screen.queryByRole('link', { name: 'Manage SSH keys' })).toBeNull();
	});
});

const DONE: DeploymentStreamState['phases'] = {
	prepare: 'done',
	load: 'done',
	replicate: 'done',
	restart: 'done',
	success: 'done',
};

function deployedState(extra: Partial<DeploymentStreamState>): DeploymentStreamState {
	return { lifecycle: 'success', phases: DONE, installLog: [], peers: [], ...extra };
}

describe('DeployProgress canary certification (Harper 5.4+)', () => {
	it('says a certified release was checked before it served', () => {
		render(<DeployProgress state={deployedState({ certification: 'certified' })} />);
		expect(screen.getByText('Certified')).toBeTruthy();
		expect(screen.getByText(/canary loaded the release before it served/)).toBeTruthy();
	});

	it.each([
		['uncertified', /went out unchecked: the component ran nothing as it loaded/],
		['unavailable', /restarted unchecked: no worker on this node loads the component/],
	])('says why an %s release went out unchecked', (certification, why) => {
		render(<DeployProgress state={deployedState({ certification })} />);
		expect(screen.getByText('Not certified')).toBeTruthy();
		expect(screen.getByText(why)).toBeTruthy();
	});

	it('renders a status it does not know rather than hiding it', () => {
		render(<DeployProgress state={deployedState({ certification: 'withdrawn' })} />);
		expect(screen.getByText('Not certified (withdrawn)')).toBeTruthy();
	});

	it('shows nothing about certification for a version that does not report it', () => {
		render(<DeployProgress state={deployedState({})} />);
		expect(screen.queryByText(/certified/i)).toBeNull();
	});

	it('shows a rejection as the decision, with the release that went back, in place of the raw message', () => {
		render(
			<DeployProgress
				state={{
					...failedState('web was not deployed: release 9b2e failed to load in its canary worker: …'),
					decision: { status: 'rejected', reason: 'web.jsResource: boom', restored: 'a3f8', failedClosed: false },
				}}
			/>,
		);
		expect(screen.getByText(/canary rejected this release on the node that received the deploy/)).toBeTruthy();
		expect(screen.getByText('web.jsResource: boom')).toBeTruthy();
		expect(screen.getByText('Deployment a3f8, the release it replaced, is live there again.')).toBeTruthy();
		expect(screen.getByText('No other node received it.')).toBeTruthy();
		expect(screen.queryByText(/web was not deployed/)).toBeNull();
	});

	it('says a rejected first release is failed closed', () => {
		render(
			<DeployProgress
				state={{
					...failedState('boom'),
					decision: { status: 'interrupted', reason: 'shutting down', restored: null, failedClosed: true },
				}}
			/>,
		);
		expect(screen.getByText(/restart stopped before the canary decided/)).toBeTruthy();
		expect(screen.getByText(/failed closed there until it is deployed again/)).toBeTruthy();
	});
});

describe('DeployProgress staging (Harper 5.3+)', () => {
	it('ends a stage at Staged, with no restart', () => {
		render(
			<DeployProgress
				staging
				state={deployedState({ phases: { prepare: 'done', replicate: 'done', staged: 'done' } })}
			/>,
		);
		expect(screen.getByText('Staged')).toBeTruthy();
		expect(screen.queryByText('Restart')).toBeNull();
		expect(screen.queryByText('Finish')).toBeNull();
	});
});

describe('DeployProgress warnings and rollout', () => {
	it('keeps the warnings the deploy streamed', () => {
		render(<DeployProgress state={deployedState({ warnings: ['Install fingerprints differ on node-b'] })} />);
		expect(screen.getByText('Warnings')).toBeTruthy();
		expect(screen.getByText('Install fingerprints differ on node-b')).toBeTruthy();
	});

	it('says the deploy is still rolling out while the job runs', () => {
		render(
			<DeployProgress
				state={deployedState({ lifecycle: 'streaming', rollout: { jobId: 'j', state: 'following', nodes: [] } })}
			/>,
		);
		expect(screen.getByText(/Rolling out to the other nodes/)).toBeTruthy();
	});

	it("names each node and how it took the release, including the one that didn't", () => {
		render(
			<DeployProgress
				state={{
					...failedState(''),
					rollout: {
						jobId: 'j',
						state: 'failed',
						nodes: [
							{ node: 'node-b', outcome: 'activated', certification: 'certified' },
							{ node: 'node-c', outcome: 'failed', detail: 'web was not deployed on this node: boom' },
						],
						message: 'Deployment 9b2e of web was not activated on 1 of 2 peer node(s): node-c (boom)',
					},
				}}
			/>,
		);
		expect(screen.getByText('node-b')).toBeTruthy();
		expect(screen.getByText('Certified')).toBeTruthy();
		expect(screen.getByText('node-c')).toBeTruthy();
		expect(screen.getByText('Did not take the release')).toBeTruthy();
		expect(screen.getByText('web was not deployed on this node: boom')).toBeTruthy();
		expect(screen.getByText(/was not activated on 1 of 2 peer node/)).toBeTruthy();
	});

	it("says it can't tell, rather than claiming success, when it could not follow the job", () => {
		render(
			<DeployProgress
				state={deployedState({ rollout: { jobId: 'j', state: 'unfollowable', nodes: [], unfollowable: 'not-found' } })}
			/>,
		);
		expect(screen.getByText(/couldn't find this deploy's restart job on the node it reached/)).toBeTruthy();
	});

	it('shows nothing for a single instance, which has no other nodes', () => {
		render(<DeployProgress state={deployedState({ rollout: { jobId: 'j', state: 'complete', nodes: [] } })} />);
		expect(screen.queryByText('Other nodes')).toBeNull();
	});

	it("links to the deployment's record, closing a hosting modal first", () => {
		const onNavigateAway = vi.fn();
		render(<DeployProgress state={deployedState({ deploymentId: 'd1' })} onNavigateAway={onNavigateAway} />);
		const link = screen.getByRole('link', { name: "View this deployment's record" });
		expect(link.getAttribute('href')).toBe('/org-1/instance/ins-1/config/deployments/d1');
		fireEvent.click(link);
		expect(onNavigateAway).toHaveBeenCalledOnce();
	});
});

describe('DeployProgress phases Harper passed over', () => {
	const phaseRow = (label: string) => screen.getByText(label).closest('li')!;

	// What an activation on Harper 5.3.2 streams: no Load, because the validation load was skipped.
	it('shows a phase with no events as skipped once a later phase has reported', () => {
		render(
			<DeployProgress
				state={deployedState({ phases: { prepare: 'done', replicate: 'done', restart: 'done', success: 'done' } })}
			/>,
		);
		expect(phaseRow('Load').textContent).toBe('Loadskipped');
		expect(phaseRow('Replicate').textContent).toBe('Replicate');
	});

	it('shows a deploy that did not restart as having skipped Restart', () => {
		render(
			<DeployProgress
				state={deployedState({ phases: { prepare: 'done', load: 'done', replicate: 'done', success: 'done' } })}
			/>,
		);
		expect(phaseRow('Restart').textContent).toBe('Restartskipped');
	});

	it('leaves the phases still to come as pending, not skipped', () => {
		render(
			<DeployProgress
				state={{ lifecycle: 'streaming', phases: { prepare: 'done', load: 'start' }, installLog: [], peers: [] }}
			/>,
		);
		expect(screen.queryByText('skipped')).toBeNull();
	});
});
