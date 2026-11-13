import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { InstanceStart } from '@/features/instance/InstanceStart';
import { registrationInfoLoader } from '@/features/instance/registrationInfoLoader';
import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

/** A component's page as a top-level tab: `/<org>/<cluster>/ext/<component>.<page>`. */
export function createExtensionTabRoute(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	return createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'ext/$extensionKey',
		head: () => ({ meta: [{ title: 'Harper Fabric' }] }),
		component: lazyRouteComponent(
			async () => import('@/features/instance/extensions/routeComponents'),
			'ExtensionTabPage',
		),
	});
}

/** The body of a component's page inside Config, mounted at `config/ext/<component>.<page>`. */
export const extensionConfigPageComponent = lazyRouteComponent(
	async () => import('@/features/instance/extensions/routeComponents'),
	'ExtensionConfigPage',
);

/**
 * `/<org>/<cluster>/start`: resolves where entering the cluster lands — its configured landing page, or
 * the first tab the viewer's nav shows — so entry points link here rather than to a fixed tab.
 */
export function createInstanceStartRoute(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	return createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'start',
		head: () => ({ meta: [{ title: 'Harper Fabric' }] }),
		// The nav's tabs depend on the instance version, read from loader data like the Config route does.
		loader: registrationInfoLoader,
		component: InstanceStart,
	});
}

/** `/<org>/<cluster>/setup`: installs a new cluster's preset once its admin has signed in. */
export function createPresetSetupRoute(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	return createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'setup',
		head: () => ({ meta: [{ title: 'Setting up — Harper Fabric' }] }),
		loader: registrationInfoLoader,
		component: lazyRouteComponent(async () => import('@/features/clusters/presets/PresetSetup'), 'PresetSetup'),
	});
}
