/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rum, routerState } = vi.hoisted(() => ({
	rum: {
		init: vi.fn(),
		startView: vi.fn(),
		onReady: vi.fn((callback: () => void) => callback()),
		setUser: vi.fn(),
		clearUser: vi.fn(),
		addAction: vi.fn(),
	},
	routerState: { href: '/#/org-1/cluster-1/apps', params: [{ organizationId: 'org-1' }] },
}));

vi.mock('@datadog/browser-rum', () => ({ datadogRum: rum }));
vi.mock('@datadog/browser-rum-react', () => ({ reactPlugin: () => ({ name: 'react' }) }));
vi.mock('@/config/constants', () => ({ isLocalStudio: false }));
vi.mock('@/hooks/useAuth', () => ({ useOverallAuth: () => ({ user: undefined }) }));
vi.mock('@tanstack/react-router', () => ({
	useLocation: () => ({ href: routerState.href }),
	useRouter: () => ({
		state: { location: { href: routerState.href } },
		matchRoutes: () => routerState.params.map((params) => ({ params })),
	}),
}));

async function loadDatadogModule() {
	vi.resetModules();
	// `enabled` is a module-scope const, so DEV has to be false before the import.
	vi.stubEnv('DEV', false);
	return import('./datadog');
}

afterEach(() => {
	cleanup();
	vi.unstubAllEnvs();
	vi.clearAllMocks();
});

describe('useDatadog', () => {
	it('initializes RUM', async () => {
		const { useDatadog } = await loadDatadogModule();
		function Harness() {
			useDatadog();
			return null;
		}

		render(<Harness />);

		expect(rum.init).toHaveBeenCalledTimes(1);
	});

	// The guard for #1570. Under `trackViewsManually` only the FIRST startView becomes an
	// `initial_load` view, and only an `initial_load` view collects LCP/FCP — so a startView
	// here is destroyed by `useOnRouteLoadTracker`'s call in the same effect flush, taking
	// Studio's Core Web Vitals with it. Ownership of that first call must stay in one place.
	it("does not start a view — that is useOnRouteLoadTracker's job", async () => {
		const { useDatadog } = await loadDatadogModule();
		function Harness() {
			useDatadog();
			return null;
		}

		render(<Harness />);

		expect(rum.startView).not.toHaveBeenCalled();
	});
});

describe('useOnRouteLoadTracker', () => {
	beforeEach(() => {
		routerState.href = '/#/org-1/cluster-1/apps';
		routerState.params = [{ organizationId: 'org-1' }];
	});

	it('starts exactly one view per render pass, named by route', async () => {
		const { useOnRouteLoadTracker } = await loadDatadogModule();
		function Harness() {
			useOnRouteLoadTracker();
			return null;
		}

		render(<Harness />);

		expect(rum.startView).toHaveBeenCalledTimes(1);
		expect(rum.startView.mock.calls[0][0]).toMatchObject({ name: expect.any(String) });
	});
});
