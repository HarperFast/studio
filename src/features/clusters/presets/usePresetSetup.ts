import { getInstanceClientIdFromParams } from '@/config/useInstanceClient';
import { ClusterPreset, findClusterPreset } from '@/features/clusters/presets/clusterPresets';
import { usePendingPresetSetup } from '@/features/clusters/presets/pendingPresetSetup';
import type { StudioConfiguration } from '@/features/instance/extensions/parseStudioConfiguration';
import type { Cluster } from '@/integrations/api/api.patch';
import { getStudioConfigurationQueryOptions } from '@/integrations/api/instance/studio/getStudioConfiguration';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

/**
 * The job a cluster was created for: what central-manager recorded, or — in the moments between
 * "Create cluster" and the first fetch that returns it, or against a central-manager that doesn't store
 * it yet — what this browser remembered when it created the cluster.
 */
export function useClusterPreset(cluster: Pick<Cluster, 'id' | 'preset'> | undefined): ClusterPreset | undefined {
	const remembered = usePendingPresetSetup(cluster?.id);
	return findClusterPreset(remembered ?? cluster?.preset ?? undefined);
}

/** Whether a cluster's own config already says its preset was set up: setup writes the landing page last. */
export function isPresetApplied(preset: ClusterPreset, configuration: StudioConfiguration): boolean {
	return configuration.landing === preset.studio.landing;
}

/**
 * The preset a cluster still owes its setup, if any, for offering "Finish setting up".
 *
 * This browser's own record says so outright, until the setup it started finishes. Otherwise the
 * cluster's own config is the answer — central-manager only knows the job, not whether it was set up —
 * and that can be read only once the viewer is signed in to the cluster, so until then nothing is owed.
 */
export function useOwedPresetSetup(
	cluster: Pick<Cluster, 'id' | 'preset'>,
	connected: boolean,
): ClusterPreset | undefined {
	const remembered = findClusterPreset(usePendingPresetSetup(cluster.id));
	const recorded = findClusterPreset(cluster.preset ?? undefined);
	const instanceParams = useMemo(() => getInstanceClientIdFromParams({ clusterId: cluster.id }), [cluster.id]);
	const { data } = useQuery(
		getStudioConfigurationQueryOptions({ ...instanceParams, enabled: connected && !remembered && !!recorded }),
	);
	return owedPreset({ remembered, recorded, configuration: data });
}

/** The decision behind {@link useOwedPresetSetup}, given what it could find out. */
export function owedPreset({ remembered, recorded, configuration }: {
	remembered: ClusterPreset | undefined;
	recorded: ClusterPreset | undefined;
	/** Undefined until the viewer is signed in to the cluster and its config has loaded. */
	configuration: StudioConfiguration | undefined;
}): ClusterPreset | undefined {
	if (remembered) {
		return remembered;
	}
	// A cluster that can't report its configuration can't confirm a setup either, so it never reads as owed.
	return recorded && configuration && !configuration.unavailable && !isPresetApplied(recorded, configuration)
		? recorded
		: undefined;
}
