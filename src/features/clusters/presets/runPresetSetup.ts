import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import type { ClusterPreset } from '@/features/clusters/presets/clusterPresets';
import { deployAndFollowComponent } from '@/integrations/api/instance/applications/deployComponent';
import { getComponents } from '@/integrations/api/instance/applications/getComponents';
import { setConfiguration } from '@/integrations/api/instance/status/setConfiguration';

export type SetupStepState = 'pending' | 'running' | 'done' | 'failed';

export interface SetupStep {
	id: string;
	label: string;
	state: SetupStepState;
	detail?: string;
}

export function presetSetupSteps(preset: ClusterPreset): SetupStep[] {
	return [
		...preset.components.map((component) => ({
			id: `deploy:${component.project}`,
			label: `Install ${component.package}`,
			state: 'pending' as const,
		})),
		{ id: 'configure', label: 'Focus Studio on this cluster’s job', state: 'pending' },
	];
}

interface RunArgs extends InstanceClientIdConfig, InstanceTypeConfig {
	preset: ClusterPreset;
	useSSE?: boolean;
	signal?: AbortSignal;
	onStep: (id: string, state: SetupStepState, detail?: string) => void;
}

/**
 * Sets a new cluster up for its preset, as the signed-in admin: deploys each component, then writes the
 * preset's `studio` block. Safe to run again after a failure — a component already on the cluster is
 * left as it is, and the config write is idempotent — so "Retry" just runs it again from the top.
 *
 * Every step needs super_user, which the cluster's first admin is.
 */
export async function runPresetSetup({ preset, onStep, signal, ...args }: RunArgs): Promise<void> {
	const installed = await installedProjects(args);
	for (const component of preset.components) {
		signal?.throwIfAborted();
		const id = `deploy:${component.project}`;
		if (installed.has(component.project)) {
			onStep(id, 'done', 'Already installed');
			continue;
		}
		onStep(id, 'running');
		try {
			const result = await deployAndFollowComponent({
				...args,
				request: { kind: 'deploy', project: component.project, package: component.package },
			});
			// An unconfirmed rollout is not a success (see deployAndFollowComponent): some node may lack it.
			if (result.rollout?.state === 'unfollowable') {
				throw new Error('Installed, but Studio could not confirm every node picked it up.');
			}
			onStep(id, 'done');
		} catch (error) {
			onStep(id, 'failed', (error as Error).message);
			throw error;
		}
	}

	signal?.throwIfAborted();
	onStep('configure', 'running');
	try {
		// Flattened keys, not a nested `studio` object: harper refuses the nested form, which would overwrite
		// the root entry of an app deployed under the name `studio` (HarperFast/harper#3656). The navigation
		// map replaces the cluster's whole map. It takes effect without a restart, so harper's generic "You
		// must restart" reply text is ignored. Replicated so every node of a cluster answers the same,
		// whichever one Studio's next request reaches.
		await setConfiguration({
			instanceClient: args.instanceClient,
			studio_navigation: preset.studio.navigation,
			studio_landing: preset.studio.landing ?? null,
			...(args.entityType === 'cluster' ? { replicated: true } : {}),
		});
		onStep('configure', 'done');
	} catch (error) {
		onStep('configure', 'failed', (error as Error).message);
		throw error;
	}
}

async function installedProjects(args: InstanceClientIdConfig): Promise<Set<string>> {
	try {
		const tree = await getComponents(args);
		return new Set((tree.entries ?? []).map((entry) => entry.name));
	} catch {
		// Not knowing only costs a redeploy of something already there.
		return new Set();
	}
}
