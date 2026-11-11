/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { permission } = vi.hoisted(() => ({ permission: { canChat: true } }));

vi.mock('@/hooks/usePermissions', () => ({ useChatPermission: () => permission.canChat }));
vi.mock('@/features/instance/InstanceNavBar', () => ({ InstanceNavBar: () => null }));
vi.mock('@/features/restart/RestartingNotice', () => ({ RestartingNotice: () => null }));
vi.mock('./applications/components/Chat/FloatingChat', () => ({ FloatingChat: () => <div>chat widget</div> }));
vi.mock('@tanstack/react-router', () => ({
	Outlet: () => null,
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1' }),
}));

import { InstanceLayout } from './InstanceLayout';

afterEach(cleanup);

describe('InstanceLayout', () => {
	it('offers chat to someone central manager lets chat', async () => {
		permission.canChat = true;
		render(<InstanceLayout />);

		expect(await screen.findByText('chat widget')).toBeTruthy();
	});

	it('leaves chat out for anyone else', async () => {
		permission.canChat = false;
		render(<InstanceLayout />);

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(screen.queryByText('chat widget')).toBeNull();
	});
});
