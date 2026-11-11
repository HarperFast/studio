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
	// Settle the lazy chat chunk, so a missing widget means the gate left it out, not that it hasn't loaded.
	await act(async () => {
		await import('./applications/components/Chat/FloatingChat');
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

	it('leaves chat out for any other member', async () => {
		auth.user = member('developers');
		await renderLayout();

		expect(screen.queryByText('chat widget')).toBeNull();
	});
});
