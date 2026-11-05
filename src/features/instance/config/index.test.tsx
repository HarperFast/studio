/** @vitest-environment jsdom */
import { ConfigIndex } from '@/features/instance/config/index';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { viewer, route } = vi.hoisted(() => ({
	viewer: { canManage: false },
	route: { pathname: '/org-1/clu-1/config' },
}));

vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => viewer.canManage }));
vi.mock('@/features/instance/extensions/ExtensionIcon', () => ({ ExtensionIcon: () => null }));
vi.mock('@/features/instance/extensions/useStudioExtensions', () => ({
	useVisibleExtensionPages: () => [{ key: 'harper-prerender.prerendering', name: 'Pre-rendering', icon: 'layers' }],
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...await importOriginal<typeof import('@tanstack/react-query')>(),
	useQuery: () => ({ data: undefined }),
}));
vi.mock('@tanstack/react-router', () => ({
	Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
	Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
	Outlet: () => <div data-testid="outlet" />,
	useLoaderData: () => ({ version: '5.4.0' }),
	useLocation: () => ({ pathname: route.pathname }),
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1' }),
}));

afterEach(() => {
	cleanup();
	viewer.canManage = false;
	route.pathname = '/org-1/clu-1/config';
});

describe('ConfigIndex', () => {
	it.each(['/org-1/clu-1/config', '/org-1/clu-1/config/'])(
		"opens a lesser role's first component entry instead of the super-user Overview at %s",
		(pathname) => {
			route.pathname = pathname;
			render(<ConfigIndex />);
			expect(screen.getByTestId('navigate').textContent).toBe('/org-1/clu-1/config/ext/harper-prerender.prerendering');
		},
	);

	it('leaves a lesser role on the component entry it opened', () => {
		route.pathname = '/org-1/clu-1/config/ext/harper-prerender.prerendering';
		render(<ConfigIndex />);
		expect(screen.queryByTestId('navigate')).toBeNull();
		expect(screen.getByTestId('outlet')).toBeTruthy();
	});

	it('keeps a super user on the Overview', () => {
		viewer.canManage = true;
		route.pathname = '/org-1/clu-1/config/';
		render(<ConfigIndex />);
		expect(screen.queryByTestId('navigate')).toBeNull();
		expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
	});
});
