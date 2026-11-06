import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import type { ClusterPreset } from '@/features/clusters/presets/clusterPresets';
import { clearDeployMark, getDeployMarks, markDeploy } from '@/features/clusters/presets/presetDeployMarks';
import {
	type BranchedDatabases,
	readBranchedDatabases,
} from '@/integrations/api/instance/applications/branchedDatabases';
import { deployAndFollowComponent } from '@/integrations/api/instance/applications/deployComponent';
import { getComponents } from '@/integrations/api/instance/applications/getComponents';
import { followRestartJob } from '@/integrations/api/instance/applications/restartJob';
import { listDeployments } from '@/integrations/api/instance/deployments/listDeployments';
import { type Deployment, TERMINAL_DEPLOYMENT_STATUSES } from '@/integrations/api/instance/deployments/types';
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
 * The `hdb_deployment` fields setup reads, with any status string: one a newer Harper adds is a deploy setup
 * can't follow, which stops it rather than counting as an outcome.
 */
type DeploymentRecord = Omit<Deployment, 'status'> & { status: string };

/**
 * A deploy of the component that has not ended. Not a `PresetInstallUnconfirmedError`, so nothing offers
 * "Install again": setup never sends a deploy beside one still running, even when asked. Retry checks again.
 * Harper's boot sweep ends only `rolling_out` records (harper `components/deploymentRecorder.ts:800`), so one
 * a node stopped mid-install never finishes; a redeploy writes a newer record, which is the one Retry reads
 * (`list_deployments` is newest first, harper `components/deploymentOperations.ts:93-95`).
 */
export class PresetDeployInFlightError extends Error {
	readonly project: string;

	constructor(project: string, record: Pick<DeploymentRecord, 'deployment_id' | 'status'>) {
		super(
			`A deploy of this component is still running (deployment ${record.deployment_id}, ${record.status}). `
				+ `Let it finish, then Retry. If it stays ${record.status}, the deploy may have stopped part way: `
				+ 'redeploy the package from Applications, then Retry, or Skip for now.',
		);
		this.name = 'PresetDeployInFlightError';
		this.project = project;
	}
}

const ENDED_DEPLOYMENT_STATUSES: ReadonlySet<string> = TERMINAL_DEPLOYMENT_STATUSES;

/** Setup refuses to run in a browser that can't hold runs in different tabs apart (`setupHoldsAcrossTabs`). */
export class PresetSetupUnsupportedError extends Error {
	constructor() {
		super(
			"This browser can't keep two tabs from running setup at the same time, so Studio won't run it here. "
				+ 'Open this page in a current version of Chrome, Edge, Firefox or Safari.',
		);
		this.name = 'PresetSetupUnsupportedError';
	}
}

/**
 * Whether runs in different tabs wait for each other. Without Web Locks nothing does: two tabs on
 * `/setup` would both pass the checks before either marks its deploy, and both send it, so setup doesn't
 * run at all there. Every browser Studio supports has them in a secure context, which the cloud is.
 */
export function setupHoldsAcrossTabs(): boolean {
	return typeof navigator !== 'undefined' && !!navigator.locks;
}

/**
 * Sets a new cluster up for its preset, as the signed-in admin: deploys each component, then merges the
 * preset's Studio settings under the cluster's own. "Retry" runs it again from the top: a component
 * already on the cluster is left as it is when its latest deploy record says every node took it, a
 * deploy still in flight stops it rather than having another sent beside it, one whose install may have
 * started and is still missing is not sent again (`presetDeployMarks`), and the settings merge changes
 * nothing the second time.
 *
 * Runs for one cluster never overlap in this browser: a Web Lock holds them across tabs, so a second tab
 * or a remount waits for the deploy in flight instead of sending another, and without one it refuses. Another browser has neither
 * the lock nor the marks; that limit comes with setting the cluster up from the browser at all.
 *
 * An abort stops it before the next request, whether it arrives during the wait for the lock or during a
 * read, and a read that fails after it rejects as the abort. A deploy already sent is not aborted, so its
 * outcome is still recorded.
 *
 * Every step needs super_user, which the cluster's first admin is.
 */
export function runPresetSetup(args: RunArgs): Promise<void> {
	if (!setupHoldsAcrossTabs()) {
		return Promise.reject(new PresetSetupUnsupportedError());
	}
	return navigator.locks.request(`Studio:PresetSetup:${args.entityId}`, { signal: args.signal }, () => runOnce(args));
}

async function runOnce({ preset, onStep, signal, ...args }: RunArgs): Promise<void> {
	signal?.throwIfAborted();
	let installed: Set<string>;
	try {
		installed = await installedProjects(args);
	} catch (error) {
		signal?.throwIfAborted();
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
		const mark = marks[project];
		if (mark === 'unconfirmed' && !installed.has(project)) {
			const error = new PresetInstallUnconfirmedError(project);
			onStep(id, 'failed', error.message);
			throw error;
		}
		if (installed.has(project)) {
			let covered: boolean;
			try {
				// A single instance listing an unmarked one is all of it. A marked one's deploy may still be running
				// even there, if the tab that sent it closed mid-rollout, and is never sent again beside it.
				covered = (!mark && args.entityType !== 'cluster') || await everyNodeHasIt({
					...args,
					project,
					signal,
					// This browser deployed a marked one, so with no record to show every node took it, it goes out again.
					unrecorded: !mark,
					onWait: (detail) => onStep(id, 'running', detail),
				});
			} catch (error) {
				signal?.throwIfAborted();
				onStep(
					id,
					'failed',
					error instanceof PresetDeployInFlightError
						? error.message
						: `Could not read how this component was last deployed: ${messageOf(error)}`,
				);
				throw error;
			}
			if (covered) {
				clearDeployMark(args.entityId, project);
				onStep(id, 'done', 'Already installed');
				continue;
			}
		}
		onStep(id, 'running');
		let kept: KeptDeploySettings = {};
		if (installed.has(project)) {
			try {
				kept = await keptDeploySettings(args, project);
			} catch (error) {
				signal?.throwIfAborted();
				// Redeploying without them would turn the application's private database copy off and drop its
				// install command.
				onStep(id, 'failed', `Could not read this component's deploy settings: ${messageOf(error)}`);
				throw error;
			}
		}
		signal?.throwIfAborted();
		// Written before sending, so a tab closed mid-deploy, or another tab, never sends it again blind.
		markDeploy(args.entityId, project, 'unconfirmed');
		let result: Awaited<ReturnType<typeof deployAndFollowComponent>>;
		try {
			// No `signal`: leaving the page lets the deploy in flight finish and record its outcome.
			result = await deployAndFollowComponent({
				...args,
				request: { kind: 'deploy', project, package: component.package, ...kept },
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
	// The navigation map replaces the cluster's whole map, so what the cluster already set is read first
	// and kept; settings Studio could not read are never written over blind.
	let current: Awaited<ReturnType<typeof getStudioConfiguration>>;
	try {
		current = await getStudioConfiguration({ instanceClient: args.instanceClient, entityId: args.entityId });
	} catch (error) {
		signal?.throwIfAborted();
		onStep('configure', 'failed', messageOf(error));
		throw error;
	}
	signal?.throwIfAborted();
	try {
		if (current.unavailable) {
			throw new Error('This cluster did not report its Studio settings, so setup left them as they are.');
		}
		// Flattened keys, not a nested `studio` object: harper refuses the nested form, which would overwrite
		// the root entry of an app deployed under the name `studio` (HarperFast/harper#3656). It takes effect
		// without a restart, so harper's generic "You must restart" reply text is ignored. Replicated so every
		// node of a cluster answers the same, whichever one Studio's next request reaches, and a node that
		// refused fails the step. Only the root config's own placements are merged: apps and plugins keep
		// theirs in their own config, and copying them here would let them outrank those apps from now on.
		const result = await setConfiguration({
			instanceClient: args.instanceClient,
			studio_navigation: { ...preset.studio.navigation, ...(current.rootNavigation ?? current.navigation) },
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

type KeptDeploySettings = { branchedDatabases?: BranchedDatabases; installCommand?: string };

/**
 * What a redeploy must resend of a listed application's root-config entry, read the way the Applications
 * redeploy reads `branchedDatabases`: a package deploy writes that entry from the request alone, keeping
 * `branchedDatabases` and `install.command` only when the request carries them (harper
 * `components/operations.ts:966-979`).
 */
async function keptDeploySettings(
	{ instanceClient }: InstanceClientIdConfig,
	project: string,
): Promise<KeptDeploySettings> {
	const { data } = await instanceClient.post('/', { operation: 'get_configuration' });
	return { branchedDatabases: readBranchedDatabases(data, project), installCommand: readInstallCommand(data, project) };
}

// Harper reads it back from the root-config entry as `install.command` (harper `components/Application.ts:229`).
function readInstallCommand(configuration: unknown, project: string): string | undefined {
	const entry = isRecord(configuration) && Object.hasOwn(configuration, project) ? configuration[project] : undefined;
	const install = isRecord(entry) ? entry.install : undefined;
	const command = isRecord(install) ? install.command : undefined;
	return typeof command === 'string' && command ? command : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether a component the node Studio reached lists is on every node, from its latest `hdb_deployment`
 * record (which replicates): another browser's rolling deploy may have stopped part way, and this browser
 * holds no mark for it. Throws `PresetDeployInFlightError` while that deploy has not ended, so none is sent
 * beside it. `unrecorded` answers for a component with no record.
 */
async function everyNodeHasIt({ project, signal, onWait, unrecorded, ...client }: InstanceClientIdConfig & {
	project: string;
	signal?: AbortSignal;
	unrecorded: boolean;
	onWait: (detail: string) => void;
}): Promise<boolean> {
	const { deployments } = await listDeployments({ ...client, project, limit: 1 });
	signal?.throwIfAborted();
	const record = deployments?.[0] as DeploymentRecord | undefined;
	if (!record) {
		// Unmarked, it was installed some other way, such as by the user from git: deploying the preset's
		// package over it would replace their component.
		return unrecorded;
	}
	const rollingOut = record.status === 'rolling_out' && !!record.restart_job_id;
	if (!ENDED_DEPLOYMENT_STATUSES.has(record.status) && !rollingOut) {
		throw new PresetDeployInFlightError(project, record);
	}
	if (record.status !== 'success' && !rollingOut) {
		return false;
	}
	const peerFailed = !!record.peer_results?.some((peer) => peer.status === 'failed' || !!peer.error);
	// A rollout still activating is waited for first: a peer that failed to stage, which
	// `ignore_replication_errors` lets through to `rolling_out` (harper `components/operations.ts:1224-1246`),
	// must not send a deploy beside it.
	if (peerFailed && !rollingOut) {
		return false;
	}
	if (!record.restart_job_id) {
		return true;
	}
	onWait('Checking that every node took the last install');
	const rollout = await followRestartJob({ ...client, jobId: record.restart_job_id, signal });
	signal?.throwIfAborted();
	// Losing track of a rollout says nothing of whether it ended, and its record says it has not.
	if (rollingOut && rollout.state === 'unfollowable') {
		throw new PresetDeployInFlightError(project, record);
	}
	return !peerFailed && rollout.state === 'complete'
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
