import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import type { ClusterPreset } from '@/features/clusters/presets/clusterPresets';
import { clearDeployMark, getDeployMarks, markDeploy } from '@/features/clusters/presets/presetDeployMarks';
import { deployAndFollowComponent } from '@/integrations/api/instance/applications/deployComponent';
import { getComponents } from '@/integrations/api/instance/applications/getComponents';
import { followRestartJob } from '@/integrations/api/instance/applications/restartJob';
import { listDeployments } from '@/integrations/api/instance/deployments/listDeployments';
import type { Deployment } from '@/integrations/api/instance/deployments/types';
import { setConfiguration } from '@/integrations/api/instance/status/setConfiguration';
import { getStudioConfiguration } from '@/integrations/api/instance/studio/getStudioConfiguration';
import { rejectReplicationFailures } from '@/integrations/api/replication';
import { SSEInconclusiveError, SSEOperationError } from '@/integrations/api/sse/errors';
import { isUnansweredWrite } from '@/integrations/api/unansweredWrite';
import { isAxiosError } from 'axios';

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

	constructor(
		project: string,
		message =
			'An install of this component was sent and never confirmed. If setup is running in another tab, let it finish; otherwise check the Applications tab and install it again if it is not there.',
	) {
		super(message);
		this.name = 'PresetInstallUnconfirmedError';
		this.project = project;
	}
}

/**
 * The `hdb_deployment` fields setup reads. Harper 5.4 adds the `rolling_out` and `partial` statuses and
 * `restart_job_id` (harper `components/deploymentRecorder.ts`), which `Deployment` predates.
 */
type DeploymentRecord = Omit<Deployment, 'status'> & { status: string; restart_job_id?: string | null };

// Harper's own terminal set (harper `components/deploymentOperations.ts`, `TERMINAL_STATUSES`).
const ENDED_DEPLOYMENT_STATUSES = new Set(['success', 'failed', 'partial', 'rolled_back', 'staged']);

const inFlight = new Map<string, Promise<void>>();

/**
 * Sets a new cluster up for its preset, as the signed-in admin: deploys each component, then merges the
 * preset's Studio settings under the cluster's own. "Retry" runs it again from the top: a component
 * already on the cluster is left as it is unless a mark or its latest deploy record says not every node
 * may have it, one whose install may have started is waited for rather than sent again
 * (`presetDeployMarks`), and the settings merge changes nothing the second time.
 *
 * Runs for one cluster never overlap in this browser: a Web Lock holds them across tabs, so a second tab
 * or a remount waits for the deploy in flight instead of sending another. Another browser has neither
 * the lock nor the marks; that limit comes with setting the cluster up from the browser at all.
 *
 * Every step needs super_user, which the cluster's first admin is.
 */
export function runPresetSetup(args: RunArgs): Promise<void> {
	if (typeof navigator !== 'undefined' && navigator.locks) {
		return navigator.locks.request(`Studio:PresetSetup:${args.entityId}`, () => runOnce(args));
	}
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
		if (marks[project] === 'unconfirmed' && !installed.has(project)) {
			const error = new PresetInstallUnconfirmedError(project);
			onStep(id, 'failed', error.message);
			throw error;
		}
		// Appearing proves the node Studio reached took it, not the rest, so a marked one is deployed again.
		if (installed.has(project) && !marks[project]) {
			let covered: boolean;
			try {
				covered = args.entityType !== 'cluster'
					|| await everyNodeHasIt({ ...args, project, signal, onWait: (detail) => onStep(id, 'running', detail) });
			} catch (error) {
				onStep(
					id,
					'failed',
					error instanceof PresetInstallUnconfirmedError
						? error.message
						: `Could not read how this component was last deployed: ${messageOf(error)}`,
				);
				throw error;
			}
			if (covered) {
				onStep(id, 'done', 'Already installed');
				continue;
			}
		}
		onStep(id, 'running');
		// Written before sending, so a tab closed mid-deploy, or another tab, never sends it again blind.
		markDeploy(args.entityId, project, 'unconfirmed');
		let result: Awaited<ReturnType<typeof deployAndFollowComponent>>;
		try {
			// No `signal`: leaving the page lets the deploy in flight finish and record its outcome.
			result = await deployAndFollowComponent({
				...args,
				request: { kind: 'deploy', project, package: component.package },
			});
		} catch (error) {
			if (error instanceof SSEInconclusiveError || isUnansweredWrite(error)) {
				// No verdict: the `unconfirmed` mark stays.
			} else if (refusedBeforeStarting(error)) {
				clearDeployMark(args.entityId, project);
			} else {
				// Harper failed it after starting (a 5xx, such as one deployed on the origin node that failed to
				// replicate, or a failed rollout), so some node may have it and Retry deploys it again.
				markDeploy(args.entityId, project, 'partial');
			}
			onStep(id, 'failed', messageOf(error));
			throw error;
		}
		// An unconfirmed rollout is not a success (see deployAndFollowComponent): some node may lack it. A
		// complete one can still carry a peer the job could not reach.
		if (
			result.rollout?.state === 'unfollowable'
			|| result.rollout?.nodes.some((node) => node.outcome === 'unconfirmed')
		) {
			markDeploy(args.entityId, project, 'partial');
			const error = new Error('Installed, but Studio could not confirm every node picked it up.');
			onStep(id, 'failed', error.message);
			throw error;
		}
		clearDeployMark(args.entityId, project);
		onStep(id, 'done');
	}

	signal?.throwIfAborted();
	onStep('configure', 'running');
	try {
		// The navigation map replaces the cluster's whole map, so what the cluster already set is read first
		// and kept; settings Studio could not read are never written over blind.
		const current = await getStudioConfiguration({ instanceClient: args.instanceClient, entityId: args.entityId });
		if (current.unavailable) {
			throw new Error('This cluster did not report its Studio settings, so setup left them as they are.');
		}
		// Flattened keys, not a nested `studio` object: harper refuses the nested form, which would overwrite
		// the root entry of an app deployed under the name `studio` (HarperFast/harper#3656). It takes effect
		// without a restart, so harper's generic "You must restart" reply text is ignored. Replicated so every
		// node of a cluster answers the same, whichever one Studio's next request reaches, and a node that
		// refused fails the step.
		const result = await setConfiguration({
			instanceClient: args.instanceClient,
			studio_navigation: { ...preset.studio.navigation, ...current.navigation },
			studio_landing: current.landing ?? preset.studio.landing,
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

/**
 * Whether a component the node Studio reached lists is on every node of the cluster, from its latest
 * `hdb_deployment` record (which replicates). Another browser's rolling deploy may have stopped part way,
 * and this browser holds no mark for it.
 */
async function everyNodeHasIt({ project, signal, onWait, ...client }: InstanceClientIdConfig & {
	project: string;
	signal?: AbortSignal;
	onWait: (detail: string) => void;
}): Promise<boolean> {
	const { deployments } = await listDeployments({ ...client, project, limit: 1 });
	const record = deployments?.[0] as DeploymentRecord | undefined;
	if (!record) {
		// Installed some other way, such as by the user from git: deploying the preset's package over it
		// would replace their component.
		return true;
	}
	const following = record.status === 'rolling_out' && !!record.restart_job_id;
	if (!ENDED_DEPLOYMENT_STATUSES.has(record.status) && !following) {
		throw new PresetInstallUnconfirmedError(
			project,
			`A deploy of this component is still running (deployment ${record.deployment_id}, ${record.status}). `
				+ 'Let it finish, then Retry; install it again only if it is stuck.',
		);
	}
	if (record.status !== 'success' && !following) {
		return false;
	}
	if (record.peer_results?.some((peer) => peer.status === 'failed' || !!peer.error)) {
		return false;
	}
	if (!record.restart_job_id) {
		return true;
	}
	onWait('Checking that every node took the last install');
	const rollout = await followRestartJob({ ...client, jobId: record.restart_job_id, signal });
	return rollout.state === 'complete'
		&& rollout.nodes.every((node) => node.outcome === 'activated' || node.outcome === 'restarted');
}

/** Only a 4xx proves Harper never started the deploy: applications/DESIGN.md, "A live deploy is sent once". */
function refusedBeforeStarting(error: unknown): boolean {
	const status = isAxiosError(error)
		? error.response?.status
		: error instanceof SSEOperationError && typeof error.code === 'number'
		? error.code
		: undefined;
	return status !== undefined && status >= 400 && status < 500;
}

// rejectReplicationFailures rejects with a string.
function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
