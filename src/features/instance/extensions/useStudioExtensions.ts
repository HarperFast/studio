import { isLocalStudio } from '@/config/constants';
import { useEntityRestURL } from '@/config/useEntityRestURL';
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
import { demoDataSource } from '@/features/instance/extensions/prototype/demoDataSource';
import { DEMO_EXTENSIONS } from '@/features/instance/extensions/prototype/demoExtensions';
import {
	FOCUS_PRESETS,
	PrototypeState,
	SIMULATED_ROLES,
	usePrototypeState,
} from '@/features/instance/extensions/prototype/prototypeState';
import { useInstanceAuth } from '@/hooks/useAuth';
import type { LocalRolePermission } from '@/integrations/api/api.patch';
import { getStudioConfigurationQueryOptions } from '@/integrations/api/instance/studio/getStudioConfiguration';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useMemo, useSyncExternalStore } from 'react';

export interface PlacedExtensionPage extends ResolvedExtensionPage {
	verdict: AccessVerdict;
}

/**
 * The cluster's Studio configuration: its tab visibility, landing page and component pages. Empty
 * until the viewer is signed in to the entity, and on a Harper that predates the operation.
 */
export function useStudioConfiguration(): { configuration: StudioConfiguration; isPending: boolean } {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const { user } = useInstanceAuth(instanceId ?? clusterId);
	const instanceParams = useInstanceClientIdParams();
	const query = useQuery(getStudioConfigurationQueryOptions({ ...instanceParams, enabled: !!user }));
	const prototype = usePrototypeState();
	const configuration = useMemo(
		() => withPrototype(query.data ?? EMPTY_STUDIO_CONFIGURATION, prototype),
		[query.data, prototype],
	);
	return { configuration, isPending: !!user && query.isPending };
}

/** Where a built-in tab or component page sits in the nav. */
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
	const { role } = usePrototypeState();
	return role === 'actual' ? user?.role?.permission : SIMULATED_ROLES[role].permission;
}

export function useExtensionDataSource(page: ResolvedExtensionPage): ExtensionDataSource {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const instanceClient = useInstanceClient();
	const restUrl = useEntityRestURL();
	const entityId = instanceId ?? clusterId ?? 'local';
	return useMemo(
		() => page.demo ? demoDataSource : createHarperDataSource(entityId, instanceClient, restUrl),
		[page.demo, entityId, instanceClient, restUrl],
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
	const cached = useSyncExternalStore(
		(onChange) => queryClient.getQueryCache().subscribe(onChange),
		() => queryClient.getQueryData<StudioConfiguration>([entityId, 'get_studio_configuration']),
	);
	const prototype = usePrototypeState();
	return useMemo(() => {
		if (typeof key !== 'string') {
			return undefined;
		}
		return withPrototype(cached ?? EMPTY_STUDIO_CONFIGURATION, prototype).pages.find((page) => page.key === key)?.name;
	}, [cached, prototype, key]);
}

/** Dev prototype: layers the switcher's demo components and focus preset over what the cluster said. */
function withPrototype(configuration: StudioConfiguration, prototype: PrototypeState): StudioConfiguration {
	if (!prototype.enabled) {
		return configuration;
	}
	const preset = FOCUS_PRESETS[prototype.focus];
	const real = new Set(configuration.pages.map((page) => page.key));
	const demo = resolveExtensionPages(
		DEMO_EXTENSIONS.filter((manifest) => prototype.installed[manifest.component]),
		true,
	)
		.filter((page) => !real.has(page.key));
	return {
		navigation: { ...configuration.navigation, ...preset.navigation },
		landing: preset.landing ?? configuration.landing,
		pages: [...configuration.pages, ...demo],
	};
}
