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
	routerState: { href: '/org-1/clu-2/apps', params: [{ organizationId: 'org-1', clusterId: 'clu-2' }] },
}));

vi.mock('@datadog/browser-rum', () => ({ datadogRum: rum }));
vi.mock('@datadog/browser-rum-react', () => ({ reactPlugin: () => ({ name: 'react' }) }));
vi.mock('@/config/constants', () => ({ isLocalStudio: false }));
vi.mock('@/hooks/useAuth', () => ({ useOverallAuth: () => ({ user: undefined }) }));
// One stable `router` identity, as the real `useRouter` returns — the tracker's effect lists
// `router` in its deps, so a fresh object per render would re-fire it on every render and the
// navigation assertions below would hold even if `location.href` were not a dependency.
vi.mock('@tanstack/react-router', () => {
	const router = {
		get state() {
			return { location: { href: routerState.href } };
		},
		matchRoutes: () => routerState.params.map((params) => ({ params })),
	};
	return {
		useLocation: () => ({ href: routerState.href }),
		useRouter: () => router,
	};
});

async function loadDatadogModule() {
	vi.resetModules();
	// `enabled` is a module-scope const, so DEV has to be false before the import.
	vi.stubEnv('DEV', false);
	return import('./datadog');
}

beforeEach(() => {
	routerState.href = '/org-1/clu-2/apps';
	routerState.params = [{ organizationId: 'org-1', clusterId: 'clu-2' }];
});

afterEach(() => {
	cleanup();
	vi.unstubAllEnvs();
	vi.clearAllMocks();
});

describe('Datadog view tracking', () => {
	it('starts exactly one view when the whole tree boots', async () => {
		const { useDatadog, useOnRouteLoadTracker } = await loadDatadogModule();
		function CloudRoot() {
			useOnRouteLoadTracker();
			return null;
		}
		function App() {
			useDatadog();
			return <CloudRoot />;
		}

		render(<App />);

		expect(rum.init).toHaveBeenCalledTimes(1);
		expect(rum.startView).toHaveBeenCalledTimes(1);
	});

	it("names that view by route, not by the hash router's pathname", async () => {
		const { useDatadog, useOnRouteLoadTracker } = await loadDatadogModule();
		function CloudRoot() {
			useOnRouteLoadTracker();
			return null;
		}
		function App() {
			useDatadog();
			return <CloudRoot />;
		}

		render(<App />);

		expect(rum.startView).toHaveBeenCalledWith(
			expect.objectContaining({ name: '/$organizationId/$clusterId/apps/' }),
		);
	});

	it('does not start a view from useDatadog', async () => {
		const { useDatadog } = await loadDatadogModule();
		function Harness() {
			useDatadog();
			return null;
		}

		render(<Harness />);

		expect(rum.startView).not.toHaveBeenCalled();
	});

	it('starts a further view on each subsequent navigation', async () => {
		const { useOnRouteLoadTracker } = await loadDatadogModule();
		function CloudRoot() {
			useOnRouteLoadTracker();
			return null;
		}

		const { rerender } = render(<CloudRoot />);
		rerender(<CloudRoot />);
		routerState.href = '/org-1/clu-2/config';
		rerender(<CloudRoot />);

		// The middle re-render changed nothing, so it must not have produced a view.
		expect(rum.startView.mock.calls.map(([options]) => options.name)).toEqual([
			'/$organizationId/$clusterId/apps/',
			'/$organizationId/$clusterId/config/',
		]);
	});
});
