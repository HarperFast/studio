/** @vitest-environment jsdom */
import { describeCluster } from '@/features/clusters/lib/clusterListModel';
import type { Cluster, ClusterSyncSummary } from '@/integrations/api/api.patch';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ClusterCard as ClusterCardView } from './ClusterCard';
function ClusterCard({ cluster, syncSummary }: { cluster: Cluster; syncSummary?: ClusterSyncSummary }) {
	return <ClusterCardView item={describeCluster(cluster, undefined, syncSummary)} />;
}

const state = vi.hoisted(() => ({
	permissions: { view: true, create: true, update: true, remove: true },
	canRunContainerOps: true,
	copy: vi.fn(),
}));
vi.mock(
	'@tanstack/react-query',
	async importOriginal => ({
		...await importOriginal<typeof import('@tanstack/react-query')>(),
		useQueryClient: () => ({ invalidateQueries: vi.fn() }),
	}),
);
vi.mock('@tanstack/react-router', () => ({
	useRouter: () => ({ navigate: vi.fn(), invalidate: vi.fn() }),
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => <a href={to} {...props}>{children}</a>,
}));
vi.mock('@/hooks/usePermissions', () => ({
	useOrganizationClusterPermissions: () => state.permissions,
	useContainerOpsPermission: () => state.canRunContainerOps,
}));
vi.mock('@/hooks/useAuth', () => ({ useInstanceAuth: () => ({ user: null, isLoading: false }) }));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClient: () => ({}) }));
vi.mock('@/features/auth/store/authStore', () => ({ authStore: { checkForFabricConnect: () => false } }));
vi.mock('@/hooks/useLocalStorage', () => ({ useLocalStorage: () => [null, vi.fn()] }));
vi.mock('@/hooks/useCopyToClipboard', () => ({ useCopyToClipboard: () => [state.copy, state.copy] }));
vi.mock(
	'@/hooks/useClusterContainerOps',
	() => ({ useClusterContainerOps: () => ({ run: vi.fn(), isPending: false }) }),
);
vi.mock(
	'@/features/clusters/mutations/terminateCluster',
	() => ({ useTerminateClusterMutation: () => ({ mutate: vi.fn(), isPending: false }) }),
);
vi.mock('@/features/clusters/components/ClusterProgress', () => ({ ClusterProgress: () => null }));
vi.mock('@/components/ConfirmDeletionModal', () => ({ ConfirmDeletionModal: () => null }));
vi.mock('@/features/clusters/components/ClusterContainerOpModals', () => ({ ClusterContainerOpModals: () => null }));
vi.mock('@/features/clusters/components/SafeModeConfirmDialog', () => ({ SafeModeConfirmDialog: () => null }));

beforeAll(() => {
	Object.assign(Element.prototype, {
		hasPointerCapture: () => false,
		setPointerCapture: () => {},
		releasePointerCapture: () => {},
		scrollIntoView: () => {},
	});
	window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
});
afterEach(() => {
	cleanup();
	state.permissions = { view: true, create: true, update: true, remove: true };
	state.canRunContainerOps = true;
	state.copy.mockClear();
});
const cluster = (overrides: Partial<Cluster> = {}): Cluster => ({
	id: 'clu-a',
	name: 'Production',
	organizationId: 'org-a',
	status: 'RUNNING',
	fqdn: 'api.example.test',
	plans: [{ planId: 'shared', region: 'US East' }],
	...overrides,
});

describe('ClusterCard', () => {
	it('renders the name, an honest status, and the existing open and copy actions', () => {
		render(<ClusterCard cluster={cluster()} />);
		expect(screen.getByRole('heading', { name: 'Production' })).toBeTruthy();
		expect(screen.getByText('Running')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Open Production' }).getAttribute('href')).toBe('/org-a/clu-a');
		fireEvent.click(screen.getByRole('button', { name: 'Copy host name' }));
		expect(state.copy).toHaveBeenCalledOnce();
	});

	it('opens the progress screen while a managed cluster is building or updating', () => {
		render(<ClusterCard cluster={cluster({ status: 'PROVISIONING' })} />);
		expect(screen.getByRole('link', { name: 'View progress for Production' }).getAttribute('href'))
			.toBe('/org-a/clu-a/starting-up');
		expect(screen.getByText('View progress')).toBeTruthy();
		cleanup();
		render(<ClusterCard cluster={cluster({ status: 'UPDATING' })} />);
		expect(screen.getByRole('link', { name: 'View progress for Production' }).getAttribute('href'))
			.toBe('/org-a/clu-a/scaling');
	});

	it('offers no progress link for other non-active statuses', () => {
		for (const status of ['FAILED', 'STARTING', 'RESTARTING']) {
			render(<ClusterCard cluster={cluster({ status })} />);
			expect(screen.queryByRole('link', { name: /View progress/ }), status).toBeNull();
			expect(screen.queryByText('View progress'), status).toBeNull();
			cleanup();
		}
	});

	it('flags a running cluster whose members are still copying data, from the sync summary', () => {
		const { container } = render(
			<ClusterCard cluster={cluster()} syncSummary={{ syncing: 2, progress: 0.31 }} />,
		);
		expect(screen.getByText('Running')).toBeTruthy();
		expect(screen.getByText('Syncing · ~31%')).toBeTruthy();
		expect(container.querySelector('svg.lucide-refresh-cw')).toBeTruthy();
	});

	it('shows no sync chip without a summary or with nothing syncing', () => {
		render(<ClusterCard cluster={cluster()} syncSummary={{ syncing: 0 }} />);
		expect(screen.queryByText(/^Syncing/)).toBeNull();
		cleanup();
		render(<ClusterCard cluster={cluster()} />);
		expect(screen.queryByText(/^Syncing/)).toBeNull();
	});

	it('keeps stopped clusters reachable through instances and exposes the start action', () => {
		render(<ClusterCard cluster={cluster({ status: 'STOPPED' })} />);
		expect(screen.getByRole('link', { name: 'Open Production' }).getAttribute('href')).toBe('/org-a/clu-a/instances');
		fireEvent.pointerDown(screen.getByRole('button', { name: 'Cluster options' }), { button: 0, ctrlKey: false });
		expect(screen.getByRole('menuitem', { name: 'Start' })).toBeTruthy();
	});

	it('leaves the container actions out for a cluster updater who cannot run them', () => {
		state.canRunContainerOps = false;
		render(<ClusterCard cluster={cluster()} />);
		fireEvent.pointerDown(screen.getByRole('button', { name: 'Cluster options' }), { button: 0, ctrlKey: false });
		expect(screen.getByRole('menuitem', { name: 'Edit Scaling' })).toBeTruthy();
		expect(screen.queryByText('Container')).toBeNull();
		for (const name of ['Restart', 'Restart in safe mode', 'Stop']) {
			expect(screen.queryByRole('menuitem', { name })).toBeNull();
		}
	});

	it('preserves finish-setup navigation without a competing whole-card link', () => {
		render(<ClusterCard cluster={cluster({ resetPassword: true })} />);
		expect(screen.queryByRole('link', { name: 'Open Production' })).toBeNull();
		expect(screen.getByRole('link', { name: 'Set Password on Production' }).getAttribute('href')).toBe(
			'/org-a/clu-a/finish-setup',
		);
		expect(screen.getByText('Setup required')).toBeTruthy();
	});

	it('does not grant card navigation or mutating menu actions to a user without permissions', () => {
		state.permissions = { view: false, create: false, update: false, remove: false };
		render(<ClusterCard cluster={cluster()} />);
		expect(screen.queryByRole('link')).toBeNull();
		fireEvent.pointerDown(screen.getByRole('button', { name: 'Cluster options' }), { button: 0, ctrlKey: false });
		expect(screen.queryByRole('menuitem', { name: 'Terminate' })).toBeNull();
		expect(screen.queryByRole('menuitem', { name: 'Edit Version' })).toBeNull();
	});

	it('makes failures and pending upgrades visible on the card', () => {
		const view = render(<ClusterCard cluster={cluster({ status: 'FAILED' })} />);
		expect(screen.getByText('Failure reported')).toBeTruthy();
		expect(screen.getByText('Open cluster options to retry or manage this cluster.')).toBeTruthy();
		state.permissions.create = false;
		view.rerender(<ClusterCard cluster={cluster({ status: 'FAILED' })} />);
		expect(screen.queryByText('Open cluster options to retry or manage this cluster.')).toBeNull();
		view.rerender(<ClusterCard cluster={cluster({ status: 'PENDING_UPGRADE' })} />);
		expect(screen.getByText('Upgrade pending')).toBeTruthy();
	});
});
