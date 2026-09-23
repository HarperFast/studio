/** @vitest-environment jsdom */
import { describeCluster } from '@/features/clusters/lib/clusterListModel';
import type { Cluster } from '@/integrations/api/api.patch';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ClusterCard as ClusterCardView } from './ClusterCard';
function ClusterCard({ cluster }: { cluster: Cluster }) {
	return <ClusterCardView item={describeCluster(cluster)} />;
}

const state = vi.hoisted(() => ({
	permissions: { view: true, create: true, update: true, remove: true },
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
vi.mock('@/hooks/usePermissions', () => ({ useOrganizationClusterPermissions: () => state.permissions }));
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
	it('renders real metadata, an honest status, and the existing open and copy actions', () => {
		render(<ClusterCard cluster={cluster()} />);
		expect(screen.getByRole('heading', { name: 'Production' })).toBeTruthy();
		expect(screen.getByText('Running')).toBeTruthy();
		expect(screen.getByText('US East')).toBeTruthy();
		expect(screen.getAllByText('Not reported')).toHaveLength(2);
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
		view.rerender(<ClusterCard cluster={cluster({ status: 'PENDING_UPGRADE' })} />);
		expect(screen.getByText('Upgrade pending')).toBeTruthy();
	});
});
