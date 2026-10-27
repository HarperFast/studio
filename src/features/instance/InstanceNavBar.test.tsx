/** @vitest-environment jsdom */
import { InstanceNavBar } from '@/features/instance/InstanceNavBar';
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
vi.mock('@/components/Breadcrumbs', () => ({ Breadcrumbs: () => null }));
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
