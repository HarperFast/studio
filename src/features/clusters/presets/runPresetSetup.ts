import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import type { ClusterPreset } from '@/features/clusters/presets/clusterPresets';
import { clearDeployMark, getDeployMarks, markDeploy } from '@/features/clusters/presets/presetDeployMarks';
import { deployAndFollowComponent } from '@/integrations/api/instance/applications/deployComponent';
import { getComponents } from '@/integrations/api/instance/applications/getComponents';
import { DeployRolloutError } from '@/integrations/api/instance/applications/restartJob';
import { setConfiguration } from '@/integrations/api/instance/status/setConfiguration';
import { rejectReplicationFailures } from '@/integrations/api/replication';
import { SSEInconclusiveError } from '@/integrations/api/sse/errors';
import { isUnansweredWrite } from '@/integrations/api/unansweredWrite';

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

/** A component whose earlier install may have started, which setup will not send again by itself. */
export class PresetInstallUnconfirmedError extends Error {
	readonly project: string;

	constructor(project: string) {
		super(
			'Studio sent this install but could not confirm it started. Check the Applications tab; if it is not there, install it again.',
		);
		this.name = 'PresetInstallUnconfirmedError';
		this.project = project;
	}
}

const inFlight = new Map<string, Promise<void>>();

/**
 * Sets a new cluster up for its preset, as the signed-in admin: deploys each component, then writes the
 * preset's Studio settings. "Retry" runs it again from the top: a component already on the cluster is
 * left as it is unless its rollout failed, one whose install may have started is waited for rather than
 * sent again (`presetDeployMarks`), and the settings write is idempotent. A run for the same cluster
 * waits for any earlier one, so a remount never sends a second deploy beside one still in flight.
 *
 * Every step needs super_user, which the cluster's first admin is.
 */
export function runPresetSetup(args: RunArgs): Promise<void> {
	const previous = inFlight.get(args.entityId);
	const run = (async () => {
		await previous?.catch(() => undefined);
		await runOnce(args);
	})();
	inFlight.set(args.entityId, run);
	const settled = () => {
		if (inFlight.get(args.entityId) === run) {
			inFlight.delete(args.entityId);
		}
	};
	run.then(settled, settled);
	return run;
}

async function runOnce({ preset, onStep, signal, ...args }: RunArgs): Promise<void> {
	let installed: Set<string>;
	try {
		installed = await installedProjects(args);
	} catch (error) {
		// Deploying without knowing what is there could send a deploy that is already running.
		onStep(
			`deploy:${preset.components[0]?.project}`,
			'failed',
			`Could not read this cluster's components: ${messageOf(error)}`,
		);
		throw error;
	}
	const marks = getDeployMarks(args.entityId);
	for (const component of preset.components) {
		signal?.throwIfAborted();
		const { project } = component;
		const id = `deploy:${project}`;
		if (marks[project] === 'unconfirmed') {
			if (!installed.has(project)) {
				const error = new PresetInstallUnconfirmedError(project);
				onStep(id, 'failed', error.message);
				throw error;
			}
			clearDeployMark(args.entityId, project);
		}
		if (installed.has(project) && marks[project] !== 'partial') {
			onStep(id, 'done', 'Already installed');
			continue;
		}
		onStep(id, 'running');
		try {
			const result = await deployAndFollowComponent({
				...args,
				request: { kind: 'deploy', project, package: component.package },
			});
			// An unconfirmed rollout is not a success (see deployAndFollowComponent): some node may lack it.
			if (result.rollout?.state === 'unfollowable') {
				markDeploy(args.entityId, project, 'partial');
				throw new Error('Installed, but Studio could not confirm every node picked it up.');
			}
			clearDeployMark(args.entityId, project);
			onStep(id, 'done');
		} catch (error) {
			if (error instanceof SSEInconclusiveError || isUnansweredWrite(error)) {
				markDeploy(args.entityId, project, 'unconfirmed');
			} else if (error instanceof DeployRolloutError) {
				markDeploy(args.entityId, project, 'partial');
			}
			onStep(id, 'failed', messageOf(error));
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
		// whichever one Studio's next request reaches, and a node that refused fails the step.
		const result = await setConfiguration({
			instanceClient: args.instanceClient,
			studio_navigation: preset.studio.navigation,
			studio_landing: preset.studio.landing ?? null,
			...(args.entityType === 'cluster' ? { replicated: true } : {}),
		});
		await rejectReplicationFailures({ data: result });
		onStep('configure', 'done');
	} catch (error) {
		onStep('configure', 'failed', messageOf(error));
		throw error;
	}
}

async function installedProjects(args: InstanceClientIdConfig): Promise<Set<string>> {
	const tree = await getComponents(args);
	return new Set((tree.entries ?? []).map((entry) => entry.name));
}

// rejectReplicationFailures rejects with a string.
function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
