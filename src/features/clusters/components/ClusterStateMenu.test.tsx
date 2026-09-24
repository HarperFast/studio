/** @vitest-environment jsdom */
import type { Cluster, User } from '@/integrations/api/api.patch';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ClusterStateMenu } from './ClusterStateMenu';

const state = vi.hoisted(() => ({ user: null as unknown, run: vi.fn() }));
vi.mock(
	'@tanstack/react-query',
	async importOriginal => ({
		...await importOriginal<typeof import('@tanstack/react-query')>(),
		useQueryClient: () => ({ invalidateQueries: vi.fn() }),
	}),
);
vi.mock('@tanstack/react-router', () => ({ useParams: () => ({}), useRouter: () => ({ navigate: vi.fn() }) }));
// Only the signed-in user is faked, so the real permission hooks gate the menu.
vi.mock(
	'@/hooks/useAuth',
	async importOriginal => ({
		...await importOriginal<typeof import('@/hooks/useAuth')>(),
		useCloudAuth: () => ({ user: state.user }),
	}),
);
vi.mock(
	'@/hooks/useClusterContainerOps',
	() => ({ useClusterContainerOps: () => ({ run: state.run, isPending: false }) }),
);
vi.mock(
	'@/features/clusters/mutations/terminateCluster',
	() => ({ useTerminateClusterMutation: () => ({ mutate: vi.fn(), isPending: false }) }),
);
vi.mock('@/features/clusters/components/ClusterContainerOpModals', () => ({
	ClusterContainerOpModals: ({ restartOpen }: { restartOpen: boolean }) => restartOpen ? <p>Restart dialog</p> : null,
}));
vi.mock('@/features/clusters/components/SafeModeConfirmDialog', () => ({ SafeModeConfirmDialog: () => null }));
vi.mock('@/components/ConfirmDeletionModal', () => ({ ConfirmDeletionModal: () => null }));

beforeAll(() => {
	Object.assign(Element.prototype, {
		hasPointerCapture: () => false,
		setPointerCapture: () => {},
		releasePointerCapture: () => {},
		scrollIntoView: () => {},
	});
	window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
	// The tooltip's arrow measures itself.
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
});
afterEach(() => {
	cleanup();
	state.run.mockClear();
});

const ORG = 'org-a';
const CONTAINER_OPS = ['Start', 'Start in safe mode', 'Restart', 'Restart in safe mode', 'Stop'];
const cluster = (overrides: Partial<Cluster> = {}): Cluster => ({
	id: 'clu-a',
	name: 'Production',
	organizationId: ORG,
	status: 'RUNNING',
	fqdn: 'api.example.test',
	plans: [{ planId: 'shared', region: 'US East' }],
	...overrides,
});
// Central manager's aggregated role shape: an admin by name, with super_user false like every org role.
const member = (role: string, clusters: { update: boolean; delete: boolean }) =>
	({
		fabricRole: 'least_privileged',
		staffPermissions: [],
		roles: {
			[ORG]: {
				role,
				organization: { id: ORG, clusters: { create: false, view: true, ...clusters, resources: [] } },
				permission: { super_user: false, structure_user: [] },
			},
		},
	}) as unknown as User;
const openMenu = () =>
	fireEvent.pointerDown(screen.getByRole('button', { name: 'Cluster actions' }), { button: 0, ctrlKey: false });
const isDisabled = (name: string) => screen.getByRole('menuitem', { name }).getAttribute('aria-disabled') === 'true';

describe('ClusterStateMenu', () => {
	it('disables container ops for a cluster updater who is not an org admin, and says why', async () => {
		state.user = member('operators', { update: true, delete: true });
		render(<ClusterStateMenu cluster={cluster()} />);
		openMenu();

		expect(CONTAINER_OPS.filter(isDisabled)).toEqual(CONTAINER_OPS);
		expect(isDisabled('Terminate')).toBe(false);
		expect(screen.getByText('Requires an organization admin')).toBeTruthy();

		// Disabled items take no pointer events, so the hover lands on their wrapper.
		fireEvent.pointerMove(screen.getByRole('menuitem', { name: 'Restart' }).parentElement!);
		expect((await screen.findByRole('tooltip')).textContent).toBe(
			'Only an organization administrator can start, stop, or restart this cluster.',
		);
	});

	it('enables the ops that fit the cluster status for an org admin', () => {
		state.user = member('admin', { update: true, delete: true });
		render(<ClusterStateMenu cluster={cluster()} />);
		openMenu();

		expect(CONTAINER_OPS.filter(name => !isDisabled(name))).toEqual(['Restart', 'Restart in safe mode', 'Stop']);
		expect(screen.queryByText('Requires an organization admin')).toBeNull();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Restart' }));
		expect(screen.getByText('Restart dialog')).toBeTruthy();
	});

	it('offers the ops to staff holding instance:update even without any cluster grant', () => {
		state.user = { fabricRole: 'fabric_support', staffPermissions: ['instance:update'], roles: {} };
		render(<ClusterStateMenu cluster={cluster({ status: 'STOPPED' })} />);
		openMenu();

		expect(isDisabled('Terminate')).toBe(true);
		fireEvent.click(screen.getByRole('menuitem', { name: 'Start' }));
		expect(state.run).toHaveBeenCalledWith('start', { safeMode: false, strategy: 'parallel' });
	});

	it('renders nothing for a member who can only view the cluster', () => {
		state.user = member('viewers', { update: false, delete: false });
		render(<ClusterStateMenu cluster={cluster()} />);
		expect(screen.queryByRole('button', { name: 'Cluster actions' })).toBeNull();
	});
});
