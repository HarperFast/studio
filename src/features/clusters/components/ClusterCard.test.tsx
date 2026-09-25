/** @vitest-environment jsdom */
import { describeCluster } from '@/features/clusters/lib/clusterListModel';
import type { Cluster, ClusterGrant } from '@/integrations/api/api.patch';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ClusterCard as ClusterCardView } from './ClusterCard';
function ClusterCard({ cluster }: { cluster: Cluster }) {
	return <ClusterCardView item={describeCluster(cluster)} />;
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

// The epic's grant-aware pills, rendered through stage's summary model like everything else above.
const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();
const trialCluster = (grant: Partial<ClusterGrant> | null, overrides: Partial<Cluster> = {}): Cluster =>
	cluster({
		id: 'clu-test',
		name: 'Test Cluster',
		organizationId: 'org-test',
		fqdn: 'test.example.harperfabric.com',
		plans: [{ planId: 'fabric-block-trial', regionId: 'us-1' }],
		grant: grant && {
			id: 'cgr-test',
			source: 'trial',
			status: 'ACTIVE',
			isActive: true,
			startsAt: daysFromNow(-1),
			endsAt: daysFromNow(29),
			cycleAnchor: null,
			expiryPolicy: 'consumer-trial',
			currentStage: null,
			stageUpdatedAt: null,
			allowedPlanIds: null,
			allowedRegionIds: null,
			timeline: null,
			...grant,
		},
		...overrides,
	} as Partial<Cluster>);

describe('ClusterCard — trial reminder', () => {
	it('shows a Trial pill and its end date for a healthy trial', () => {
		render(<ClusterCard cluster={trialCluster({})} />);
		expect(screen.getByText('Trial').getAttribute('title')).toMatch(/^Trial ends /);
		expect(screen.getByText(/^Ends [A-Z][a-z]{2} \d{1,2}$/)).toBeTruthy();
	});

	it('shows nothing extra for a purchased plan', () => {
		render(<ClusterCard cluster={trialCluster({ source: 'purchased', expiryPolicy: null })} />);
		expect(screen.queryByText(/^Trial/)).toBeNull();
	});

	// The reminder and the countdown share a slot; once the runner stages the grant, only the
	// countdown is shown.
	it('gives way to the expiry countdown once the trial is staged', () => {
		render(<ClusterCard cluster={trialCluster({ currentStage: 'WARNED', endsAt: daysFromNow(5) })} />);
		expect(screen.queryByText(/^Trial/)).toBeNull();
		expect(screen.getByText('Ends in 5 days')).toBeTruthy();
		expect(screen.getByText(/^[A-Z][a-z]{2} \d{1,2}$/), 'the end date beside the countdown').toBeTruthy();
	});
});

// Both upgrade states share the AWAITING_PLAN stage; only the one still in flight may spin.
describe('ClusterCard — upgrade badge', () => {
	it('spins while the upgrade is applying', () => {
		render(
			<ClusterCard
				cluster={trialCluster({ source: 'purchased', expiryPolicy: 'conversion-pending' }, {
					conversionState: 'APPLYING',
				})}
			/>,
		);
		expect(screen.getByText('Upgrading').querySelector('.animate-spin')).not.toBeNull();
	});

	it('does not spin once the upgrade has failed', () => {
		render(<ClusterCard cluster={trialCluster({}, { conversionState: 'FAILED' })} />);
		expect(screen.getByText('Upgrade failed').querySelector('.animate-spin')).toBeNull();
	});
});
