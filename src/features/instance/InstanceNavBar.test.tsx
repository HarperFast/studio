/** @vitest-environment jsdom */
import { InstanceNavBar } from '@/features/instance/InstanceNavBar';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { permission, studio, route } = vi.hoisted(() => ({
	permission: { canManage: true },
	route: { loaderData: { version: '5.3.0' } as { version: string } | undefined },
	studio: {
		navigation: {} as Record<string, 'visible' | 'tucked' | 'hidden'>,
		tabs: [] as { key: string; name: string; icon: string }[],
		configEntries: [] as { key: string; name: string; icon: string }[],
	},
}));

vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => permission.canManage }));
vi.mock('@/hooks/useAuth', () => ({
	useInstanceAuth: () => ({ user: { role: { permission: { super_user: permission.canManage } } } }),
}));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => ({}) }));
vi.mock('@/components/Breadcrumbs', () => ({
	BreadcrumbList: ({ collapse, keepPath }: { collapse?: number; keepPath?: string }) => (
		<div data-testid="crumbs" data-collapse={collapse} data-keep-path={keepPath} />
	),
	useBreadcrumbTrail: () => [
		{ path: '/org-1', label: 'Org' },
		{ path: '/org-1/clu-1', label: 'Cluster' },
		{ path: '/org-1/clu-1/instance/ins-1', label: 'Instance' },
		{ path: '/org-1/clu-1/instance/ins-1/databases', label: 'Databases' },
	],
}));
vi.mock('@/features/instance/extensions/useStudioExtensions', () => ({
	useNavigationVisibility: () => (key: string) => studio.navigation[key] ?? 'visible',
	useVisibleExtensionPages: (placement: 'tab' | 'config') => placement === 'tab' ? studio.tabs : studio.configEntries,
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQuery: () => ({ data: undefined }),
}));
vi.mock('@tanstack/react-router', () => ({
	Link: ({ to, activeOptions: _activeOptions, activeProps: _activeProps, inactiveProps: _inactiveProps, ...props }:
		& ComponentProps<'a'>
		& { to: string; activeOptions?: unknown; activeProps?: unknown; inactiveProps?: unknown }) => (
		<a href={to} {...props} />
	),
	useLoaderData: () => route.loaderData,
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1', instanceId: 'ins-1' }),
	useMatchRoute: () => ({ to }: { to: string }) => to.endsWith('/databases') ? {} : false,
}));

beforeAll(() => {
	// Radix menus need these in jsdom (see AGENTS.md, "Testing Radix menus in jsdom").
	Element.prototype.hasPointerCapture = () => false;
	Element.prototype.setPointerCapture = () => {};
	Element.prototype.releasePointerCapture = () => {};
	Element.prototype.scrollIntoView = () => {};
	window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	permission.canManage = true;
	studio.navigation = {};
	studio.tabs = [];
	studio.configEntries = [];
	route.loaderData = { version: '5.3.0' };
});

describe('InstanceNavBar', () => {
	it('renders nothing, rather than crashing, while its route has no loader data', () => {
		route.loaderData = undefined;
		const { container } = render(<InstanceNavBar />);
		expect(container.innerHTML).toBe('');
	});

	it('keeps the instance breadcrumb when the full path and the leading fold exceed the available width', () => {
		vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(350);
		vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function(this: HTMLElement) {
			const trail = this.querySelector('[data-testid="crumbs"]');
			return trail?.hasAttribute('data-keep-path') ? 300 : trail?.hasAttribute('data-collapse') ? 400 : 450;
		});

		render(<InstanceNavBar />);

		expect(screen.getByTestId('crumbs').getAttribute('data-keep-path')).toBe('/org-1/clu-1/instance/ins-1');
	});

	it('offers the operations console to a super user', () => {
		permission.canManage = true;
		render(<InstanceNavBar />);

		expect(screen.getByRole('link', { name: 'Operations' }).getAttribute('href'))
			.toBe('/org-1/clu-1/instance/ins-1/operations');
	});

	it('hides it from anyone else', () => {
		permission.canManage = false;
		render(<InstanceNavBar />);

		expect(screen.queryByRole('link', { name: 'Operations' })).toBeNull();
		expect(screen.getByRole('link', { name: 'Databases' })).toBeTruthy();
	});
});

describe("InstanceNavBar under a cluster's studio configuration", () => {
	it('leaves a hidden tab out of the nav entirely', () => {
		studio.navigation = { applications: 'hidden', operations: 'hidden' };
		render(<InstanceNavBar />);

		expect(screen.queryByRole('link', { name: 'Applications' })).toBeNull();
		expect(screen.queryByRole('link', { name: 'Operations' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
		expect(screen.getAllByRole('link', { name: 'Databases' }).length).toBeGreaterThan(0);
	});

	it('moves a tucked tab into the More menu', () => {
		studio.navigation = { logs: 'tucked' };
		render(<InstanceNavBar />);

		expect(screen.queryByRole('link', { name: 'Logs' })).toBeNull();
		fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), { button: 0, ctrlKey: false });
		expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Logs' }).getAttribute('href'))
			.toBe('/org-1/clu-1/instance/ins-1/logs');
	});

	it('shows the current section and keeps tucked entries available when the links run out of room', () => {
		studio.navigation = { logs: 'tucked', operations: 'hidden' };
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
			.mockReturnValueOnce(new DOMRect(0, 480, 520, 48))
			.mockReturnValueOnce(new DOMRect(0, 480, 500, 40));

		render(<InstanceNavBar />);
		const trigger = screen.getByRole('button', { name: 'Studio sections · Databases' });
		expect(screen.getByRole('link', { name: 'Databases' }).closest('[inert]')).toBeTruthy();
		fireEvent.keyDown(trigger, { key: 'ArrowDown' });

		const menu = within(screen.getByRole('menu'));
		expect(menu.getByRole('menuitem', { name: 'Databases' }).getAttribute('href'))
			.toBe('/org-1/clu-1/instance/ins-1/databases');
		expect(within(menu.getByRole('group', { name: 'More' })).getByRole('menuitem', { name: 'Logs' })).toBeTruthy();
		expect(menu.queryByRole('menuitem', { name: 'Operations' })).toBeNull();
	});

	it("places a component's tab before Config, and lets the cluster tuck it", () => {
		studio.tabs = [{ key: 'harper-redirects.redirects', name: 'Redirects', icon: 'signpost' }];
		const { unmount } = render(<InstanceNavBar />);
		const names = screen.getAllByRole('link').map((link) => link.textContent);
		expect(names.indexOf('Redirects')).toBe(names.indexOf('Config') - 1);
		unmount();

		studio.navigation = { 'harper-redirects.redirects': 'tucked' };
		render(<InstanceNavBar />);
		expect(screen.queryByRole('link', { name: 'Redirects' })).toBeNull();
		expect(screen.getByRole('button', { name: 'More' })).toBeTruthy();
	});

	it('offers Config to a lesser role only when a component added an entry for it', () => {
		permission.canManage = false;
		const { unmount } = render(<InstanceNavBar />);
		expect(screen.queryByRole('link', { name: 'Config' })).toBeNull();
		unmount();

		studio.configEntries = [{ key: 'harper-prerender.prerendering', name: 'Pre-rendering', icon: 'layers' }];
		render(<InstanceNavBar />);
		expect(screen.getAllByRole('link', { name: 'Config' })[0].getAttribute('href')).toBe(
			'/org-1/clu-1/instance/ins-1/config',
		);
	});
});
