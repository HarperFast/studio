import { deletedClusterStatuses } from '@/config/clusterStatuses';
import { Cluster, Instance } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { pluralize } from '@/lib/pluralize';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';

/**
 * Central manager's floor (`RECORD_LOCKS_MIN_VERSION` in its `recordLockHomes.js`). It compares with
 * `semver.lt`, so a 5.3.0 prerelease is below it, and it refuses a version that isn't valid SemVer.
 */
export const RECORD_LOCKS_MIN_VERSION = '5.3.0';

// `semver.valid` with default options: it trims, takes a leading `v` but not `=`, and rejects leading
// zeros in numeric parts and numeric prerelease identifiers. Studio's own parser accepts all of those.
const IDENTIFIER = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)';
const VALID_SEMVER = new RegExp(
	`^v?(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-${IDENTIFIER}(?:\\.${IDENTIFIER})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
);

// `semver`'s MAX_LENGTH, measured before it trims, and its refusal of a numeric part past MAX_SAFE_INTEGER.
const MAX_VERSION_LENGTH = 256;

export function supportsRecordLocks(version: string | null | undefined): boolean {
	if (!version || version.length > MAX_VERSION_LENGTH) {
		return false;
	}
	const trimmed = version.trim();
	if (!VALID_SEMVER.test(trimmed)) {
		return false;
	}
	if (trimmed.replace(/^v/, '').split(/[-+]/)[0].split('.').some(part => !Number.isSafeInteger(Number(part)))) {
		return false;
	}
	return wasAReleasedBeforeB(RECORD_LOCKS_MIN_VERSION, trimmed.replace(/^v/, ''));
}

/** Members that still belong to the cluster, as central manager's `isTerminalInstanceState` counts them. */
function liveInstances(cluster: Cluster): Instance[] {
	return (cluster.instances ?? []).filter(instance =>
		!(instance.status && deletedClusterStatuses.includes(instance.status))
	);
}

function describeInstance(instance: Pick<Instance, 'id' | 'name' | 'instanceFqdn'>): string {
	return instance.name || instance.instanceFqdn || instance.id;
}

function describeStatus(status: string): string {
	return status.toLowerCase().replaceAll('_', ' ');
}

export type RecordLocksPhase = 'off' | 'on' | 'applying' | 'stopped';

export interface RecordLocksState {
	/** The cluster's setting, which central manager rolls onto the members and gives new ones. */
	enabled: boolean;
	phase: RecordLocksPhase;
	/** Live members on the cluster's setting, and of those, the ones back to running, of `total`. */
	applied: number;
	done: number;
	total: number;
}

/** A member that disagrees with the cluster is one the roll hasn't reached, or one it gave up on (DESIGN.md). */
export function recordLocksState(cluster: Cluster): RecordLocksState {
	const enabled = cluster.recordLocks === true;
	const live = liveInstances(cluster);
	const onSetting = live.filter(instance => (instance.recordLocks === true) === enabled);
	const applied = onSetting.length;
	const done = onSetting.filter(instance => !instance.status || instance.status === 'RUNNING').length;
	const total = live.length;
	const phase: RecordLocksPhase = applied < total
		? (cluster.status === 'UPDATING' ? 'applying' : 'stopped')
		: enabled
		? 'on'
		: 'off';
	return { enabled, phase, applied, done, total };
}

/**
 * A running cluster with a live member that isn't running. A change can't start from that (central
 * manager requires every member running), so seen after a save, it means the roll already ran and stopped.
 */
export function hasMemberNotRunning(cluster: Cluster): boolean {
	return cluster.status === 'RUNNING'
		&& liveInstances(cluster).some(instance => instance.status && instance.status !== 'RUNNING');
}

export interface RecordLocksRefusal {
	message: string;
	/** Nothing on the page clears it: a failed instance needs recovering first. */
	needsSupport: boolean;
	needsUpgrade?: boolean;
}

/**
 * What central manager is certain to refuse, read from the record it checks, so this never blocks a
 * change it would take (DESIGN.md). A missing status isn't treated as a refusal for the same reason.
 */
export function recordLocksBlocker(cluster: Cluster, target: boolean): RecordLocksRefusal | null {
	if (clusterIsSelfManaged(cluster)) {
		return { message: "Record locks aren't available on self-hosted clusters.", needsSupport: false };
	}
	if (cluster.status && cluster.status !== 'RUNNING') {
		return {
			message: cluster.status === 'UPDATING'
				? 'The cluster is updating. Record locks can change once it is running again.'
				: `The cluster is ${describeStatus(cluster.status)}. Record locks can only change while it is running.`,
			needsSupport: false,
		};
	}
	if (!cluster.instances?.length) {
		return { message: 'The cluster has no instances yet.', needsSupport: false };
	}
	const live = liveInstances(cluster);
	const notRunning = live.find(instance => instance.status && instance.status !== 'RUNNING');
	if (notRunning?.status) {
		const failed = notRunning.status === 'FAILED';
		const instance = failed
			? `${describeInstance(notRunning)} has failed.`
			: `${describeInstance(notRunning)} is ${describeStatus(notRunning.status)}.`;
		return {
			message: failed
				? `${instance} Every instance has to be running to change record locks, so it needs recovering first.`
				: `${instance} Every instance has to be running to change record locks.`,
			needsSupport: failed,
		};
	}
	if (target) {
		const unsupported = live.filter(instance => !supportsRecordLocks(instance.version));
		if (unsupported.length) {
			const versions = [...new Set(unsupported.map(instance => instance.version || 'an unknown version'))];
			return {
				message: `Record locks need Harper ${RECORD_LOCKS_MIN_VERSION} or later, and ${
					pluralize(unsupported.length, 'instance', 'instances')
				} ${unsupported.length === 1 ? 'runs' : 'run'} ${versions.join(', ')}. Upgrade the cluster first.`,
				needsSupport: false,
				needsUpgrade: true,
			};
		}
	}
	return null;
}
