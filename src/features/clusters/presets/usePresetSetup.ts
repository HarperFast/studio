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
	const remembered = usePendingPresetSetup(cluster?.id);
	return findClusterPreset(remembered ?? cluster?.preset ?? undefined);
}

/**
 * Whether a cluster's own config shows its preset was set up: a landing page is set (setup writes it
 * last) and the preset's landing page is among the pages the answering node's components declare. A
 * landing alone could have been set by hand with nothing installed, and an admin may move it later.
 */
export function isPresetApplied(preset: ClusterPreset, configuration: StudioConfiguration): boolean {
	return !!configuration.landing && configuration.pages.some((page) => page.key === preset.studio.landing);
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
	const remembered = findClusterPreset(usePendingPresetSetup(cluster.id));
	const recorded = findClusterPreset(cluster.preset ?? undefined);
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

/** The decision behind {@link useOwedPresetSetup}, given what it could find out. */
export function owedPreset({ remembered, recorded, configuration }: {
	remembered: ClusterPreset | undefined;
	recorded: ClusterPreset | undefined;
	/** Undefined until the viewer is signed in to the cluster and its config has loaded. */
	configuration: StudioConfiguration | undefined;
}): ClusterPreset | undefined {
	const preset = remembered ?? recorded;
	if (preset && configuration && !configuration.unavailable) {
		return isPresetApplied(preset, configuration) ? undefined : preset;
	}
	// A cluster that can't report its configuration can't confirm a setup either, so only this browser's
	// own record makes it owed.
	return remembered;
}
