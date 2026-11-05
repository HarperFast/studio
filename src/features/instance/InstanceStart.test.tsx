/** @vitest-environment jsdom */
import { InstanceStart } from '@/features/instance/InstanceStart';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface Page {
	key: string;
	name: string;
	icon: string;
	placement: 'tab' | 'config';
	/** What the viewer's role may open, as `useVisibleExtensionPages` filters it. */
	allowed: boolean;
}

const { studio, permission, route } = vi.hoisted(() => ({
	studio: {
		navigation: {} as Record<string, 'visible' | 'tucked' | 'hidden'>,
		landing: undefined as string | undefined,
		pages: [] as Page[],
	},
	permission: { canManage: true },
	route: { params: {} as Record<string, string> },
}));

vi.mock('@/hooks/useAuth', () => ({ useInstanceAuth: () => ({ user: { username: 'admin' } }) }));
vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => permission.canManage }));
vi.mock('@/features/instance/extensions/useStudioExtensions', () => ({
	useStudioConfiguration: () => ({
		configuration: { navigation: studio.navigation, landing: studio.landing, pages: studio.pages },
		isPending: false,
	}),
	useNavigationVisibility: () => (key: string) => studio.navigation[key] ?? 'visible',
	useVisibleExtensionPages: (placement: 'tab' | 'config') =>
		studio.pages.filter((page) => page.placement === placement && page.allowed),
}));
vi.mock('@tanstack/react-router', () => ({
	Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
	Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
	useLoaderData: () => ({ version: '5.4.0' }),
	useParams: () => route.params,
}));

const cluster = { organizationId: 'org-1', clusterId: 'clu-1' };
const instance = { ...cluster, instanceId: 'ins-1' };
const prerendering: Page = {
	key: 'harper-prerender.prerendering',
	name: 'Pre-rendering',
	icon: 'layers',
	placement: 'config',
	allowed: true,
};

function landsOn() {
	render(<InstanceStart />);
	return screen.queryByTestId('navigate')?.textContent;
}

afterEach(() => {
	cleanup();
	studio.navigation = {};
	studio.landing = undefined;
	studio.pages = [];
	permission.canManage = true;
	route.params = {};
});

describe('InstanceStart', () => {
	it("lands on a component's tab", () => {
		route.params = cluster;
		studio.pages = [{ ...prerendering, key: 'harper-redirects.redirects', placement: 'tab' }];
		studio.landing = 'harper-redirects.redirects';
		expect(landsOn()).toBe('/org-1/clu-1/ext/harper-redirects.redirects');
	});

	it('lands on a page inside Config, which the nav never lists as a tab', () => {
		route.params = cluster;
		studio.pages = [prerendering];
		studio.landing = prerendering.key;
		expect(landsOn()).toBe('/org-1/clu-1/config/ext/harper-prerender.prerendering');
	});

	it('lands a lesser role on a Config page its role may open', () => {
		permission.canManage = false;
		route.params = cluster;
		studio.pages = [prerendering];
		studio.landing = prerendering.key;
		expect(landsOn()).toBe('/org-1/clu-1/config/ext/harper-prerender.prerendering');
	});

	it("falls back to the first tab when the viewer's role may not open the Config page", () => {
		permission.canManage = false;
		route.params = cluster;
		studio.pages = [{ ...prerendering, allowed: false }];
		studio.landing = prerendering.key;
		expect(landsOn()).toBe('/org-1/clu-1/databases');
	});

	it('never lands on a hidden tab, so a hidden Applications index cannot loop back here', () => {
		route.params = instance;
		studio.navigation = { applications: 'hidden' };
		studio.landing = 'applications';
		expect(landsOn()).toBe('/org-1/clu-1/instance/ins-1/databases');
	});

	it('lands on a tucked tab', () => {
		route.params = cluster;
		studio.navigation = { logs: 'tucked' };
		studio.landing = 'logs';
		expect(landsOn()).toBe('/org-1/clu-1/logs');
	});

	it('explains, rather than showing a blank page, when the navigation hides every tab the role can open', () => {
		permission.canManage = false;
		route.params = cluster;
		studio.navigation = { databases: 'hidden' };
		expect(landsOn()).toBeUndefined();
		expect(screen.getByRole('heading', { name: 'Nothing to open here' })).toBeTruthy();
		expect(screen.getByText(/Ask an administrator/)).toBeTruthy();
		expect(screen.queryByRole('link')).toBeNull();
	});

	it('points a super user, who can undo the navigation, at the tabs it hides rather than at an administrator', () => {
		route.params = cluster;
		studio.navigation = Object.fromEntries(
			['applications', 'databases', 'apis', 'operations', 'status', 'logs', 'config'].map((key) => [key, 'hidden']),
		);
		expect(landsOn()).toBeUndefined();
		expect(screen.getByRole('heading', { name: 'Nothing to open here' })).toBeTruthy();
		expect(screen.queryByText(/administrator/)).toBeNull();
		expect(screen.getByRole('link', { name: 'Config' }).getAttribute('href')).toBe('/org-1/clu-1/config');
		expect(screen.getByRole('link', { name: 'Operations' }).getAttribute('href')).toBe('/org-1/clu-1/operations');
	});
});
