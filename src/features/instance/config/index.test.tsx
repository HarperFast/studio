/** @vitest-environment jsdom */
import { ConfigIndex } from '@/features/instance/config/index';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PRERENDER = { key: 'harper-prerender.prerendering', name: 'Pre-rendering', icon: 'layers', placement: 'config' };

const { viewer, route, entries } = vi.hoisted(() => ({
	viewer: { canManage: false, version: '5.4.0' },
	route: { pathname: '/org-1/clu-1/config' },
	entries: { pages: [] as Record<string, string>[], pending: false },
}));

vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => viewer.canManage }));
vi.mock('@/hooks/useInstanceOperationPermission', () => ({ useInstanceOperationAccess: () => false }));
vi.mock('@/features/instance/extensions/ExtensionIcon', () => ({ ExtensionIcon: () => null }));
vi.mock('@/features/instance/extensions/useStudioExtensions', () => ({
	useVisibleExtensionPages: () => entries.pages,
	useStudioConfiguration: () => ({ isPending: entries.pending }),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...await importOriginal<typeof import('@tanstack/react-query')>(),
	useQuery: () => ({ data: undefined }),
}));
vi.mock('@tanstack/react-router', () => ({
	// Keeps the role and handlers a menu item's Slot hands its Link; drops the router-only props.
	Link: ({ to, children, activeOptions: _a, activeProps: _p, inactiveProps: _i, ...anchor }: {
		to: string;
		children: ReactNode;
		activeOptions?: unknown;
		activeProps?: unknown;
		inactiveProps?: unknown;
	}) => <a href={to} {...anchor}>{children}</a>,
	Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
	Outlet: () => <div data-testid="outlet" />,
	useLoaderData: () => ({ version: viewer.version }),
	useLocation: () => ({ pathname: route.pathname }),
	useMatchRoute: () => ({ to, fuzzy }: { to: string; fuzzy?: boolean }) =>
		route.pathname === to || (!!fuzzy && route.pathname.startsWith(`${to}/`)) ? {} : false,
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1' }),
}));

beforeEach(() => {
	entries.pages = [PRERENDER];
});

afterEach(() => {
	cleanup();
	viewer.canManage = false;
	entries.pending = false;
	viewer.version = '5.4.0';
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

	it("opens a plugin's entry by its whole key, the npm scope's slash encoded", () => {
		entries.pages = [{ ...PRERENDER, key: 'shop.@harperfast/prerender.prerendering' }];
		render(<ConfigIndex />);
		expect(screen.getByTestId('navigate').textContent).toBe(
			'/org-1/clu-1/config/ext/shop.%40harperfast%2Fprerender.prerendering',
		);
	});

	it('leaves a lesser role on the component entry it opened', () => {
		route.pathname = '/org-1/clu-1/config/ext/harper-prerender.prerendering';
		render(<ConfigIndex />);
		expect(screen.queryByTestId('navigate')).toBeNull();
		expect(screen.getByTestId('outlet')).toBeTruthy();
	});

	it("waits on a reload of a lesser role's component entry until the entries have loaded", () => {
		route.pathname = '/org-1/clu-1/config/ext/harper-prerender.prerendering';
		entries.pages = [];
		entries.pending = true;
		render(<ConfigIndex />);
		expect(screen.queryByTestId('navigate')).toBeNull();
		expect(screen.getByText('Loading...')).toBeTruthy();
	});

	it('keeps a super user on the Overview', () => {
		viewer.canManage = true;
		route.pathname = '/org-1/clu-1/config/';
		render(<ConfigIndex />);
		expect(screen.queryByTestId('navigate')).toBeNull();
		expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
	});

	it('lists AI Models for a super user from the release that has the models block', () => {
		viewer.canManage = true;
		viewer.version = '5.1.0';
		render(<ConfigIndex />);
		expect(screen.getAllByText('AI Models')[0].closest('a')?.getAttribute('href')).toBe(
			'/org-1/clu-1/config/ai-models',
		);
		cleanup();
		viewer.version = '5.0.4';
		render(<ConfigIndex />);
		expect(screen.queryByText('AI Models')).toBeNull();
	});

	it('keeps AI Models from a role that cannot manage the instance', () => {
		route.pathname = '/org-1/clu-1/config/ext/harper-prerender.prerendering';
		render(<ConfigIndex />);
		expect(screen.queryByText('AI Models')).toBeNull();
	});
});

describe('ConfigIndex on a small screen', () => {
	const smallScreenNav = () => screen.getByRole('navigation', { name: 'Configuration page picker' });
	const openMenu = () => {
		fireEvent.pointerDown(within(smallScreenNav()).getByRole('button'), { button: 0, ctrlKey: false });
		return screen.getAllByRole('menuitem');
	};

	it('shows one button naming the current page rather than a row of every page', () => {
		viewer.canManage = true;
		route.pathname = '/org-1/clu-1/config/roles/cluster_user';
		render(<ConfigIndex />);
		expect(within(smallScreenNav()).queryAllByRole('link')).toEqual([]);
		expect(within(smallScreenNav()).getByRole('button', { name: 'Configuration Roles' })).toBeTruthy();
	});

	it.each(['/org-1/clu-1/config', '/org-1/clu-1/config/'])('names the Overview at %s', (pathname) => {
		viewer.canManage = true;
		route.pathname = pathname;
		render(<ConfigIndex />);
		expect(within(smallScreenNav()).getByRole('button', { name: 'Configuration Overview' })).toBeTruthy();
	});

	it('opens to the Overview and then the same groups as the sidebar', () => {
		viewer.canManage = true;
		route.pathname = '/org-1/clu-1/config/users';
		render(<ConfigIndex />);
		const items = openMenu();
		expect(items[0].textContent).toBe('Overview');
		expect(items[0].getAttribute('href')).toBe('/org-1/clu-1/config');
		const names = items.map((item) => item.textContent);
		expect(names).toContain('Pre-rendering');
		const access = screen.getByRole('group', { name: 'Access & security' });
		expect(within(access).getByRole('menuitem', { name: 'Users' })).toBeTruthy();
		const sidebar = screen.getByRole('navigation', { name: 'Configuration pages' });
		const accessLinks = within(within(sidebar).getByRole('list', { name: 'Access & security' })).getAllByRole('link');
		expect(accessLinks.map(item => item.textContent)).toEqual(
			within(access).getAllByRole('menuitem').map(item => item.textContent),
		);
		expect(items.find((item) => item.textContent === 'Users')?.getAttribute('href')).toBe('/org-1/clu-1/config/users');
	});

	it("lists only a lesser role's component pages, without the Overview", () => {
		route.pathname = '/org-1/clu-1/config/ext/harper-prerender.prerendering';
		render(<ConfigIndex />);
		expect(within(smallScreenNav()).getByRole('button', { name: 'Configuration Pre-rendering' })).toBeTruthy();
		expect(openMenu().map((item) => item.textContent)).toEqual(['Pre-rendering']);
	});

	it('leaves the button out when there is no page to offer', () => {
		entries.pages = [];
		route.pathname = '/org-1/clu-1/config/users';
		render(<ConfigIndex />);
		expect(screen.queryByRole('navigation', { name: 'Configuration page picker' })).toBeNull();
	});
});
