/** @vitest-environment jsdom */
import type { User } from '@/integrations/api/api.patch';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { auth } = vi.hoisted(() => ({ auth: { user: null as User | null } }));

vi.mock('@/hooks/useAuth', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/hooks/useAuth')>()),
	useCloudAuth: () => ({ user: auth.user }),
}));
vi.mock('@/features/instance/InstanceNavBar', () => ({ InstanceNavBar: () => null }));
vi.mock('@/features/restart/RestartingNotice', () => ({ RestartingNotice: () => null }));
vi.mock('./applications/components/Chat/FloatingChat', () => ({ FloatingChat: () => <div>chat widget</div> }));
// The dev-only panel reads Studio configuration through React Query, and this render has no QueryClient.
vi.mock('./extensions/prototype/PrototypePanel', () => ({ PrototypePanel: () => null }));
vi.mock('@tanstack/react-router', () => ({
	Outlet: () => <main>page</main>,
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1' }),
}));

import { InstanceLayout } from './InstanceLayout';

const member = (role: string) =>
	({
		fabricRole: 'least_privileged',
		staffPermissions: [],
		roles: { 'org-1': { role, organization: {} } },
	}) as unknown as User;

async function renderLayout() {
	render(<InstanceLayout />);
	// Settle the lazy chunks, so a missing widget means the gate left it out, not that it hasn't loaded, and
	// the dev panel renders in every case rather than only when its chunk happens to win the race.
	await act(async () => {
		await import('./applications/components/Chat/FloatingChat');
		await import('./extensions/prototype/PrototypePanel');
	});
	expect(screen.getByText('page')).toBeTruthy();
}

afterEach(cleanup);

describe('InstanceLayout', () => {
	it('offers chat to an admin of the organization in the route', async () => {
		auth.user = member('admin');
		await renderLayout();

		expect(screen.getByText('chat widget')).toBeTruthy();
	});

	it('offers chat to staff who may read and write it', async () => {
		auth.user = {
			fabricRole: 'fabric_admin',
			staffPermissions: ['chat:read', 'chat:write'],
			roles: {},
		} as unknown as User;
		await renderLayout();

		expect(screen.getByText('chat widget')).toBeTruthy();
	});

	it('leaves chat out for any other member', async () => {
		auth.user = member('developers');
		await renderLayout();

		expect(screen.queryByText('chat widget')).toBeNull();
	});
});
