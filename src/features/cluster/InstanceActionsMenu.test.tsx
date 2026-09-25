/** @vitest-environment jsdom */
import type { Instance, User } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { InstanceActionsMenu } from './InstanceActionsMenu';

const ORG = 'org-a';
const state = vi.hoisted(() => ({ user: null as unknown, run: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ organizationId: 'org-a', clusterId: 'clu-b' }),
	Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
// Only the signed-in user is faked, so the real permission hooks decide what the menu offers.
vi.mock(
	'@/hooks/useAuth',
	async importOriginal => ({
		...await importOriginal<typeof import('@/hooks/useAuth')>(),
		useCloudAuth: () => ({ user: state.user }),
		useInstanceAuth: () => ({ user: undefined, isLoading: false }),
	}),
);
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClient: () => ({}),
	useInstanceClientIdParams: () => ({}),
}));
vi.mock('@/integrations/api/instance/status/getStatus', () => ({
	getStatusQueryOptions: () => ({ queryKey: ['status'], queryFn: () => null, enabled: false }),
	getSystemStatusById: () => undefined,
}));
vi.mock('@/integrations/api/instance/status/setStatus', () => ({ useSetStatus: () => ({ mutate: vi.fn() }) }));
vi.mock('@/hooks/useInstanceContainerOps', () => ({ useInstanceContainerOps: () => ({ run: state.run }) }));
vi.mock('@/hooks/useCopyToClipboard', () => ({ useCopyToClipboard: () => [vi.fn(), vi.fn()] }));
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
	state.run.mockClear();
});

const instance = { id: 'ins-c', name: 'primary', status: 'RUNNING', instanceFqdn: 'ins-c.example.com' } as Instance;
const member = (role: string) =>
	({
		fabricRole: 'least_privileged',
		staffPermissions: [],
		roles: {
			[ORG]: {
				role,
				organization: {
					id: ORG,
					clusters: { create: true, view: true, update: true, delete: true, resources: [] },
				},
				permission: { super_user: false, structure_user: [] },
			},
		},
	}) as unknown as User;

function openMenu() {
	render(
		<QueryClientProvider client={new QueryClient()}>
			<InstanceActionsMenu instance={instance} isSelfManaged={false} />
		</QueryClientProvider>,
	);
	fireEvent.pointerDown(screen.getByRole('button', { name: 'Instance options' }), { button: 0, ctrlKey: false });
}

describe('InstanceActionsMenu container ops', () => {
	it('leaves them out for an instance updater who is not an org admin', () => {
		state.user = member('operators');
		openMenu();
		expect(screen.getByRole('menuitem', { name: 'Fabric Connect' })).toBeTruthy();
		expect(screen.queryByText('Container')).toBeNull();
		for (const name of ['Restart', 'Restart in safe mode', 'Stop']) {
			expect(screen.queryByRole('menuitem', { name })).toBeNull();
		}
	});

	it('offers them to an org admin', () => {
		state.user = member('admin');
		openMenu();
		expect(screen.getByRole('menuitem', { name: 'Restart' })).toBeTruthy();
		expect(screen.getByRole('menuitem', { name: 'Restart in safe mode' })).toBeTruthy();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Stop' }));
		expect(state.run).toHaveBeenCalledWith('stop');
	});
});
