import { isLocalStudio } from '@/config/constants';
import { useInstanceClient, useInstanceClientIdParams } from '@/config/useInstanceClient';
import { OverallAppSignIn } from '@/features/auth/store/authStore';
import { AccessVerdict, checkExtensionAccess } from '@/features/instance/extensions/access';
import { createHarperDataSource, ExtensionDataSource } from '@/features/instance/extensions/dataSource';
import { ResolvedExtensionPage, resolveExtensionPages } from '@/features/instance/extensions/manifest';
import {
	EMPTY_STUDIO_CONFIGURATION,
	StudioConfiguration,
	TabVisibility,
} from '@/features/instance/extensions/parseStudioConfiguration';
import type { PrototypeState } from '@/features/instance/extensions/prototype/prototypeState';
import { useInstanceAuth } from '@/hooks/useAuth';
import type { LocalRolePermission } from '@/integrations/api/api.patch';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import {
	getStudioConfigurationQueryOptions,
	mayAnswerStudioConfiguration,
} from '@/integrations/api/instance/studio/getStudioConfiguration';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

export interface PlacedExtensionPage extends ResolvedExtensionPage {
	verdict: AccessVerdict;
}

const UNAVAILABLE_STUDIO_CONFIGURATION: StudioConfiguration = { ...EMPTY_STUDIO_CONFIGURATION, unavailable: true };

// The dev prototype loads only on the dev server. A production build reads `import.meta.env.DEV` as
// `false` and drops these imports, so these hooks add none of it to the bundle. Imported statically, the
// prototype modules' top-level code would still ship with every use behind a flag. Awaited here, not in
// the hooks, because a hook can't switch to `usePrototypeState` once it arrives without changing its hook
// count. The wait is safe: those modules import only types and React, so no cycle back here can stall it.
const devPrototype = import.meta.env.DEV
	? await Promise.all([
		import('@/features/instance/extensions/prototype/prototypeState'),
		import('@/features/instance/extensions/prototype/demoExtensions'),
		import('@/features/instance/extensions/prototype/demoDataSource'),
	]).then(([state, extensions, data]) => ({ ...state, ...extensions, ...data }))
	: undefined;
const PROTOTYPE_OFF: PrototypeState = Object.freeze({
	enabled: false,
	installed: {},
	role: 'actual',
	focus: 'none',
	panelOpen: false,
});
const usePrototype: () => PrototypeState = devPrototype?.usePrototypeState ?? (() => PROTOTYPE_OFF);

/**
 * The cluster's Studio configuration: its tab visibility, landing page and component pages. Empty
 * until the viewer is signed in to the entity, and on a Harper that predates the operation, which isn't
 * asked at all when its version says so (local Studio too: a Harper package bundles whatever Studio is
 * on `prod` when it is built, so a 5.3 patch can carry this one).
 */
export function useStudioConfiguration(): { configuration: StudioConfiguration; isPending: boolean } {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const { user } = useInstanceAuth(instanceId ?? clusterId);
	const signedIn = !!user;
	const instanceParams = useInstanceClientIdParams();
	// The instance layout's loader has usually read it already. A failed read leaves the version unknown.
	const registration = useQuery({ ...getRegistrationInfoQueryOptions(instanceParams), enabled: signedIn });
	const asks = !registration.isPending && mayAnswerStudioConfiguration(registration.data?.version);
	const query = useQuery(getStudioConfigurationQueryOptions({ ...instanceParams, enabled: signedIn && asks }));
	const prototype = usePrototype();
	// Another view may still have cached a real answer, which wins over the version's.
	const data = query.data ?? (registration.isPending || asks ? undefined : UNAVAILABLE_STUDIO_CONFIGURATION);
	const configuration = useMemo(
		() => withPrototype(data ?? EMPTY_STUDIO_CONFIGURATION, prototype),
		[data, prototype],
	);
	// A query that is never sent stays pending in React Query, so only one that is sent counts.
	const isPending = signedIn && query.data === undefined && (registration.isPending || (asks && query.isPending));
	return { configuration, isPending };
}

export function useNavigationVisibility(): (key: string) => TabVisibility {
	const { configuration } = useStudioConfiguration();
	return useMemo(() => (key: string) => configuration.navigation[key] ?? 'visible', [configuration.navigation]);
}

/** Every page the cluster's components contribute, each with whether the viewer's role may see it. */
export function useExtensionPages(): PlacedExtensionPage[] {
	const { configuration } = useStudioConfiguration();
	const permission = useExtensionPermission();
	return useMemo(
		() => configuration.pages.map((page) => ({ ...page, verdict: checkExtensionAccess(permission, page.access) })),
		[configuration.pages, permission],
	);
}

/** The pages a viewer may open in one placement, alphabetical. */
export function useVisibleExtensionPages(placement: ResolvedExtensionPage['placement']): PlacedExtensionPage[] {
	const pages = useExtensionPages();
	return useMemo(
		() =>
			pages
				.filter((page) => page.placement === placement && page.verdict.allowed)
				.sort((a, b) => a.name.localeCompare(b.name)),
		[pages, placement],
	);
}

/** The role extension pages are judged against: the viewer's, or (dev prototype) the switcher's stand-in. */
export function useExtensionPermission(): LocalRolePermission | undefined {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const { user } = useInstanceAuth(instanceId ?? clusterId);
	const { role } = usePrototype();
	return role === 'actual' || !devPrototype ? user?.role?.permission : devPrototype.SIMULATED_ROLES[role].permission;
}

export function useExtensionDataSource(page: ResolvedExtensionPage): ExtensionDataSource {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const instanceClient = useInstanceClient();
	const entityId = instanceId ?? clusterId ?? 'local';
	return useMemo(
		() => page.demo && devPrototype ? devPrototype.demoDataSource : createHarperDataSource(entityId, instanceClient),
		[page.demo, entityId, instanceClient],
	);
}

/**
 * A page's name by key, for the breadcrumbs. Reads whatever the nav bar already loaded and never fetches
 * or subscribes to an entity's sign-in: the breadcrumbs render outside the instance routes too (a
 * terminated cluster's overview), where either would contact its host.
 */
export function useExtensionPageName(key: unknown): string | undefined {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const entityId = isLocalStudio ? OverallAppSignIn : instanceId ?? clusterId;
	const queryClient = useQueryClient();
	const subscribe = useCallback((onChange: () => void) => queryClient.getQueryCache().subscribe(onChange), [
		queryClient,
	]);
	const getSnapshot = useCallback(
		() => queryClient.getQueryData<StudioConfiguration>([entityId, 'get_studio_configuration']),
		[queryClient, entityId],
	);
	const cached = useSyncExternalStore(subscribe, getSnapshot);
	const prototype = usePrototype();
	return useMemo(() => {
		if (typeof key !== 'string') {
			return undefined;
		}
		return withPrototype(cached ?? EMPTY_STUDIO_CONFIGURATION, prototype).pages.find((page) => page.key === key)?.name;
	}, [cached, prototype, key]);
}

/** Dev prototype: layers the switcher's demo components and focus preset over what the cluster said. */
function withPrototype(configuration: StudioConfiguration, prototype: PrototypeState): StudioConfiguration {
	if (!devPrototype || !prototype.enabled) {
		return configuration;
	}
	const preset = devPrototype.FOCUS_PRESETS[prototype.focus];
	const real = new Set(configuration.pages.map((page) => page.key));
	const demo = resolveExtensionPages(
		devPrototype.DEMO_EXTENSIONS.filter((manifest) => prototype.installed[manifest.component]),
		true,
	)
		.filter((page) => !real.has(page.key));
	return {
		navigation: { ...configuration.navigation, ...preset.navigation },
		landing: preset.landing ?? configuration.landing,
		pages: [...configuration.pages, ...demo],
	};
}
