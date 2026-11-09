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

// What `semver.valid` accepts by default: three numeric parts, an optional prerelease and build, and
// an optional leading `v` or `=`. Studio's own parser is laxer (`5.3` parses), so it can't decide this.
const VALID_SEMVER = /^[v=]?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** Whether central manager lets a cluster on `version` run record locks. */
export function supportsRecordLocks(version: string | null | undefined): boolean {
	if (!version || !VALID_SEMVER.test(version.trim())) {
		return false;
	}
	return wasAReleasedBeforeB(RECORD_LOCKS_MIN_VERSION, version.trim().replace(/^[v=]/, ''));
}

/** Members that still belong to the cluster, as central manager's `isTerminalInstanceState` counts them. */
function liveInstances(cluster: Cluster): Instance[] {
	return (cluster.instances ?? []).filter(instance =>
		!(instance.status && deletedClusterStatuses.includes(instance.status))
	);
}

/** Live members central manager would refuse record locks on, for the version they run. */
export function instancesBelowRecordLocksFloor(cluster: Cluster): Instance[] {
	return liveInstances(cluster).filter(instance => !supportsRecordLocks(instance.version));
}

export function describeInstance(instance: Pick<Instance, 'id' | 'name' | 'instanceFqdn'>): string {
	return instance.name || instance.instanceFqdn || instance.id;
}

function describeStatus(status: string): string {
	return status.toLowerCase().replaceAll('_', ' ');
}

export type RecordLocksPhase = 'off' | 'on' | 'applying' | 'stopped';

export interface RecordLocksState {
	/** The cluster's setting: what central manager rolls onto the members and gives new ones. */
	enabled: boolean;
	/**
	 * `applying` while the cluster is mid-update with members still on the old setting; `stopped` when
	 * the cluster is no longer updating but some are, which is what a roll that failed part way leaves.
	 */
	phase: RecordLocksPhase;
	/** Live members already on the cluster's setting. */
	applied: number;
	/** Live members. */
	total: number;
}

/**
 * Where record locks stand on a cluster. The cluster's `recordLocks` is the intent, written before the
 * roll starts; each member's own `recordLocks` changes only once its restart is handed to host
 * manager, and a failed roll puts the member it stopped on back to its old value. So a member that
 * disagrees with the cluster is one the roll hasn't reached, or one it gave up on.
 */
export function recordLocksState(cluster: Cluster): RecordLocksState {
	const enabled = cluster.recordLocks === true;
	const live = liveInstances(cluster);
	const applied = live.filter(instance => (instance.recordLocks === true) === enabled).length;
	const total = live.length;
	const phase: RecordLocksPhase = applied < total
		? (cluster.status === 'UPDATING' ? 'applying' : 'stopped')
		: enabled
		? 'on'
		: 'off';
	return { enabled, phase, applied, total };
}

export interface RecordLocksRefusal {
	message: string;
	/** Nothing on the page clears it: a failed instance needs recovering first. */
	needsSupport: boolean;
	/** Upgrading the cluster clears it. */
	needsUpgrade?: boolean;
}

/**
 * Why central manager would refuse to set record locks to `target` on this cluster, or `null` when it
 * would accept. Only conditions it is certain to refuse, read from the same record it checks
 * (`updateClusterRecordLocks` and `assertClusterMutable` in `updateCluster.js`), so this never blocks a
 * change the server would take. Anything else it refuses still arrives as its own error.
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
		const unsupported = instancesBelowRecordLocksFloor(cluster);
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
