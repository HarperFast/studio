/** @vitest-environment jsdom */
import { InstanceNavBar, navBarLayouts } from '@/features/instance/InstanceNavBar';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { permission, studio } = vi.hoisted(() => ({
	permission: { canManage: true },
	studio: {
		navigation: {} as Record<string, 'visible' | 'tucked' | 'hidden'>,
		tabs: [] as { key: string; name: string; icon: string }[],
		configEntries: [] as { key: string; name: string; icon: string }[],
	},
}));

vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => permission.canManage }));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => ({}) }));
vi.mock('@/components/Breadcrumbs', () => ({
	Breadcrumbs: () => null,
	BreadcrumbList: ({ collapse, className }: { collapse?: number; className?: string }) => (
		<div data-testid="crumbs" data-collapse={collapse ?? 0} className={className} />
	),
	useBreadcrumbTrail: () => [
		{ path: '/org-1', label: 'Org' },
		{ path: '/org-1/clu-1', label: 'Cluster' },
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
	Link: ({ to, children, 'aria-label': ariaLabel }: { to: string; children: ReactNode; 'aria-label'?: string }) => (
		<a href={to} aria-label={ariaLabel}>{children}</a>
	),
	useLoaderData: () => ({ version: '5.3.0' }),
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1', instanceId: 'ins-1' }),
	useLocation: () => ({ pathname: '/org-1/clu-1/instance/ins-1/databases' }),
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
	permission.canManage = true;
	studio.navigation = {};
	studio.tabs = [];
	studio.configEntries = [];
});

describe('InstanceNavBar', () => {
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

describe('navBarLayouts', () => {
	it('folds the first crumb, drops the tab names, folds the rest down to the last crumb, then moves tabs', () => {
		expect(navBarLayouts(3, 4)).toEqual([
			{ labels: true, collapse: 0, overflow: 0 },
			{ labels: true, collapse: 1, overflow: 0 },
			{ labels: false, collapse: 1, overflow: 0 },
			{ labels: false, collapse: 2, overflow: 0 },
			{ labels: false, collapse: 2, overflow: 1 },
			{ labels: false, collapse: 2, overflow: 2 },
			{ labels: false, collapse: 2, overflow: 3 },
		]);
	});

	it('never unfolds a crumb it has folded', () => {
		const collapses = navBarLayouts(5, 6).map((layout) => layout.collapse);
		expect(collapses).toEqual([...collapses].sort((a, b) => a - b));
	});

	it('only drops the tab names where there is a single crumb or none, and keeps a lone tab', () => {
		const namesThenIcons = [{ labels: true, collapse: 0, overflow: 0 }, { labels: false, collapse: 0, overflow: 0 }];
		expect(navBarLayouts(1, 1)).toEqual(namesThenIcons);
		expect(navBarLayouts(0, 0)).toEqual(namesThenIcons);
	});
});

describe('InstanceNavBar fitting its bar', () => {
	const desktopCrumbs = () => screen.getAllByTestId('crumbs')[0];
	const shownTabs = () => screen.getAllByRole('link').map((link) => link.getAttribute('aria-label'));

	afterEach(() => vi.restoreAllMocks());

	it('names every tab and keeps every crumb at natural width while they fit', () => {
		render(<InstanceNavBar />);
		expect(screen.getAllByRole('link', { name: 'Databases' })[0].textContent).toBe('Databases');
		expect(desktopCrumbs().getAttribute('data-collapse')).toBe('0');
		expect(desktopCrumbs().className).toContain('shrink-0');
		expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
	});

	it('moves the tabs nearest the last one into More, keeping the last tab, once nothing else is left to give', () => {
		const { unmount } = render(<InstanceNavBar />);
		const every = shownTabs();
		unmount();

		// A bar with room for five tabs.
		vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function(this: HTMLElement) {
			return this.querySelectorAll('a').length * 100;
		});
		vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500);
		render(<InstanceNavBar />);

		expect(shownTabs()).toEqual([...every.slice(0, 4), every.at(-1)]);
		expect(screen.getAllByRole('link', { name: 'Databases' })[0].textContent).toBe('');
		expect(screen.getAllByRole('link', { name: 'Applications' })[0].textContent).toBe('Apps');
		expect(desktopCrumbs().getAttribute('data-collapse')).toBe('2');
		expect(desktopCrumbs().className).toContain('min-w-40');

		fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), { button: 0, ctrlKey: false });
		const moved = within(screen.getByRole('menu')).getAllByRole('link').map((link) => link.textContent);
		expect(moved).toEqual(every.slice(4, -1));
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
		// The mocked Link drops Radix's menuitem props, so find it as the link inside the open menu.
		expect(within(screen.getByRole('menu')).getByRole('link', { name: 'Logs' }).getAttribute('href'))
			.toBe('/org-1/clu-1/instance/ins-1/logs');
	});

	it("places a component's tab before Config, and lets the cluster tuck it", () => {
		studio.tabs = [{ key: 'harper-redirects.redirects', name: 'Redirects', icon: 'signpost' }];
		const { unmount } = render(<InstanceNavBar />);
		const names = screen.getAllByRole('link').map((link) => link.getAttribute('aria-label'));
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
