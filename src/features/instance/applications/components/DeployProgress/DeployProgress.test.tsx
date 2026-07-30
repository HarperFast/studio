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
