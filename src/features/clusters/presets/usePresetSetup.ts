import { getInstanceClientIdFromParams } from '@/config/useInstanceClient';
import { ClusterPreset, findClusterPreset } from '@/features/clusters/presets/clusterPresets';
import { forgetPendingPresetSetup, usePendingPresetSetup } from '@/features/clusters/presets/pendingPresetSetup';
import type { StudioConfiguration } from '@/features/instance/extensions/parseStudioConfiguration';
import type { Cluster } from '@/integrations/api/api.patch';
import { getStudioConfigurationQueryOptions } from '@/integrations/api/instance/studio/getStudioConfiguration';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

/**
 * The job a cluster was created for: what central-manager recorded, or — in the moments between
 * "Create cluster" and the first fetch that returns it, or against a central-manager that doesn't store
 * it yet — what this browser remembered when it created the cluster.
 */
export function useClusterPreset(cluster: Pick<Cluster, 'id' | 'preset'> | undefined): ClusterPreset | undefined {
	const remembered = useRememberedPreset(cluster);
	return findClusterPreset(cluster?.preset || remembered);
}

/**
 * This browser's record of the preset it created the cluster with, unless central-manager records a
 * different one: its preset can change after creation, and running the old one's setup would install
 * components the cluster is no longer for. A record that disagrees is forgotten.
 */
function useRememberedPreset(cluster: Pick<Cluster, 'id' | 'preset'> | undefined): string | undefined {
	const clusterId = cluster?.id;
	const remembered = usePendingPresetSetup(clusterId);
	const stale = !!remembered && !!cluster?.preset && remembered !== cluster.preset;
	useEffect(() => {
		if (stale && clusterId) {
			forgetPendingPresetSetup(clusterId);
		}
	}, [stale, clusterId]);
	return stale ? undefined : remembered;
}

/**
 * Whether a cluster's own config shows its preset was set up: a landing page is set, the root config
 * places every tab the preset places (setup writes both in its last step), and the preset's landing page
 * is among the pages the answering node's components declare. A landing alone could have been set by
 * hand, or kept from before a setup that stopped short of that step; an admin may move it, or change a
 * placement, later.
 */
export function isPresetApplied(preset: ClusterPreset, configuration: StudioConfiguration): boolean {
	const placed = configuration.rootNavigation ?? configuration.navigation;
	return !!configuration.landing
		&& Object.keys(preset.studio.navigation).every((key) => key in placed)
		&& configuration.pages.some((page) => page.key === preset.studio.landing);
}

/**
 * The preset a cluster still owes its setup, if any, for offering "Finish setting up".
 *
 * The cluster's own config is the answer once the viewer is signed in to it and it has loaded:
 * central-manager only knows the job, not whether it was set up, and another browser may have finished
 * it. Until then this browser's own record of the setup it started stands in, and is forgotten once the
 * config shows the setup done.
 */
export function useOwedPresetSetup(
	cluster: Pick<Cluster, 'id' | 'preset'>,
	connected: boolean,
): ClusterPreset | undefined {
	const remembered = findClusterPreset(useRememberedPreset(cluster));
	const recorded = findClusterPreset(cluster.preset || undefined);
	const instanceParams = useMemo(() => getInstanceClientIdFromParams({ clusterId: cluster.id }), [cluster.id]);
	const { data } = useQuery(
		getStudioConfigurationQueryOptions({ ...instanceParams, enabled: connected && !!(remembered ?? recorded) }),
	);
	const finished = !!remembered && !!data && !data.unavailable && isPresetApplied(remembered, data);
	useEffect(() => {
		if (finished) {
			forgetPendingPresetSetup(cluster.id);
		}
	}, [finished, cluster.id]);
	return owedPreset({ remembered, recorded, configuration: data });
}

export function owedPreset({ remembered, recorded, configuration }: {
	remembered: ClusterPreset | undefined;
	recorded: ClusterPreset | undefined;
	/** Undefined until the viewer is signed in to the cluster and its config has loaded. */
	configuration: StudioConfiguration | undefined;
}): ClusterPreset | undefined {
	const preset = recorded ?? remembered;
	if (preset && configuration && !configuration.unavailable) {
		return isPresetApplied(preset, configuration) ? undefined : preset;
	}
	// A cluster that can't report its configuration can't confirm a setup either, so only this browser's
	// own record makes it owed.
	return remembered;
}
