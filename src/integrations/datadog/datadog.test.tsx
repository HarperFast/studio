/**
 * @vitest-environment jsdom
 */
import { deployModes } from '@/config/constants';
import { stubDeployBuild } from '@/test/stubDeployBuild';
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

// Defaultless: a default would substitute a deployed value for an explicit `undefined`.
async function loadDatadogModuleForMode(mode: string | undefined, envName: string | undefined) {
	vi.resetModules();
	stubDeployBuild({ mode, envName });
	return import('./datadog');
}

async function loadDatadogModule() {
	return loadDatadogModuleForMode('prod', 'prod');
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

describe('Datadog reporting guard', () => {
	function renderApp(useDatadog: () => void, useOnRouteLoadTracker: () => void) {
		function CloudRoot() {
			useOnRouteLoadTracker();
			return null;
		}
		function App() {
			useDatadog();
			return <CloudRoot />;
		}
		render(<App />);
	}

	it.each([...deployModes])('reports from a %s deploy, tagged with its environment', async (mode) => {
		const { useDatadog, useOnRouteLoadTracker } = await loadDatadogModuleForMode(mode, mode);

		renderApp(useDatadog, useOnRouteLoadTracker);

		expect(rum.init).toHaveBeenCalledWith(expect.objectContaining({ env: mode }));
		expect(rum.startView).toHaveBeenCalledTimes(1);
	});

	// `production` is the mode a bare `vite build` runs in — the one that shipped untagged events.
	it.each([undefined, '', 'production', 'localstudio', 'test'])('stays silent in mode %o', async (mode) => {
		const { useDatadog, useOnRouteLoadTracker } = await loadDatadogModuleForMode(mode, mode);

		renderApp(useDatadog, useOnRouteLoadTracker);

		expect(rum.init).not.toHaveBeenCalled();
		expect(rum.startView).not.toHaveBeenCalled();
	});

	it('stays silent in a bare build whose .env.local names a deploy environment', async () => {
		const { useDatadog, useOnRouteLoadTracker } = await loadDatadogModuleForMode('production', 'prod');

		renderApp(useDatadog, useOnRouteLoadTracker);

		expect(rum.init).not.toHaveBeenCalled();
	});

	// The shape of a mode listed here but missing from vite.config.ts's DEPLOY_MODES.
	it('stays silent in a deploy mode whose env file was never read', async () => {
		const { useDatadog, useOnRouteLoadTracker } = await loadDatadogModuleForMode('prod', undefined);

		renderApp(useDatadog, useOnRouteLoadTracker);

		expect(rum.init).not.toHaveBeenCalled();
	});
});
