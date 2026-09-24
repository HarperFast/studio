/**
 * The clusters and instances Studio knows are restarting, so a planned outage is not treated as a
 * failure. Fed by Studio's own Harper `restart` runs (callers mark and release them — central
 * manager never hears of these) and by central manager's container-op statuses, mirrored from every
 * cluster record fetched ({@link syncRestartsFromCluster}).
 *
 * A `down` entity is unreachable, so instance clients hold requests to it (`installRestartGate`). A
 * `rolling` cluster restarts one member at a time and stays reachable directly — but central
 * manager's operations proxy refuses any entity mid container op (400 "…is not active"), so the
 * marks it reports carry `proxyRefuses` and proxied clients hold for those too ({@link holdsRequests}).
 *
 * Every mark expires, so a lost release or a cluster nobody polls any more cannot hold requests for
 * the rest of the session.
 */

export type RestartReach = 'down' | 'rolling';

export interface RestartState {
	reach: RestartReach;
	/** Central manager's operations proxy refuses requests for this entity until the op completes. */
	proxyRefuses: boolean;
	/** What the entity is doing, as a heading: `Restarting` or `Starting`. */
	label: string;
}

interface Mark extends RestartState {
	/** When this mark was last written — lets a CM sync ignore a response older than the mark. */
	setAt: number;
	expiresAt: number;
}

export interface MarkRestartingOptions {
	reach: RestartReach;
	label?: string;
	/** How long the mark may outlive its owner. It is still released explicitly when done. */
	ttlMs: number;
}

/** The token every CM-derived mark is filed under, so a sync only ever replaces its own marks. */
const CONTAINER_TOKEN = Symbol('container');

/** CM marks lapse this long after the last cluster fetch that confirmed them. Pages that care poll
 *  every 5–10s, so this only fires once nothing is watching the cluster any more. */
const CONTAINER_MARK_TTL_MS = 60_000;

/**
 * CM statuses for a container on its way back up. `STOPPING` is deliberately absent: holding
 * requests only makes sense for an entity that will answer them afterwards.
 */
const COMING_BACK_LABELS: Record<string, string> = {
	RESTARTING: 'Restarting',
	STARTING: 'Starting',
};

/** CM statuses in which an instance's operations API does not answer. */
const UNREACHABLE_STATUSES = new Set(['RESTARTING', 'STARTING', 'STOPPING', 'STOPPED']);

const TERMINAL_INSTANCE_STATUSES = new Set(['TERMINATED', 'TERMINATING', 'REMOVED']);

const marks = new Map<string, Map<symbol, Mark>>();
const listeners = new Set<() => void>();
const settledListeners = new Set<(entityId: string) => void>();
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let version = 0;

function purgeExpired(now: number) {
	for (const [entityId, byToken] of marks) {
		for (const [token, mark] of byToken) {
			if (mark.expiresAt <= now) {
				byToken.delete(token);
			}
		}
		if (byToken.size === 0) {
			marks.delete(entityId);
		}
	}
}

function scheduleExpiry() {
	clearTimeout(expiryTimer);
	expiryTimer = undefined;
	let earliest = Infinity;
	for (const byToken of marks.values()) {
		for (const mark of byToken.values()) {
			earliest = Math.min(earliest, mark.expiresAt);
		}
	}
	if (earliest !== Infinity) {
		expiryTimer = setTimeout(() => mutate(() => {}), Math.max(0, earliest - Date.now()));
	}
}

/**
 * Apply a change, then tell everyone once. Settled notifications are deferred a tick: a sync runs
 * inside the cluster query's own fetch, and a listener that invalidates queries would otherwise
 * cancel the very fetch that reported the recovery.
 */
function mutate(change: () => void) {
	const before = new Set(marks.keys());
	change();
	purgeExpired(Date.now());
	scheduleExpiry();
	version += 1;
	for (const listener of listeners) {
		listener();
	}
	const settled = [...before].filter((entityId) => !marks.has(entityId));
	if (settled.length) {
		setTimeout(() => {
			for (const entityId of settled) {
				for (const listener of settledListeners) {
					listener(entityId);
				}
			}
		}, 0);
	}
}

function setMark(entityId: string, token: symbol, mark: Mark) {
	let byToken = marks.get(entityId);
	if (!byToken) {
		byToken = new Map();
		marks.set(entityId, byToken);
	}
	byToken.set(token, mark);
}

function deleteMark(entityId: string, token: symbol, unlessSetAfter = Infinity) {
	const byToken = marks.get(entityId);
	const mark = byToken?.get(token);
	if (!byToken || !mark || mark.setAt > unlessSetAfter) {
		return;
	}
	byToken.delete(token);
	if (byToken.size === 0) {
		marks.delete(entityId);
	}
}

/**
 * Track `entityIds` as restarting until the returned release is called (or `ttlMs` passes).
 * Concurrent marks on one entity are independent — releasing one leaves the others in force.
 *
 * These are Studio's own restarts, which central manager never hears about, so its proxy keeps
 * routing to them (`proxyRefuses: false`).
 */
export function markRestarting(
	entityIds: readonly string[],
	{ reach, label = 'Restarting', ttlMs }: MarkRestartingOptions,
): () => void {
	const token = Symbol('restart');
	const now = Date.now();
	mutate(() => {
		for (const entityId of entityIds) {
			setMark(entityId, token, { reach, proxyRefuses: false, label, setAt: now, expiresAt: now + ttlMs });
		}
	});
	let released = false;
	return () => {
		if (released) { return; }
		released = true;
		mutate(() => {
			for (const entityId of entityIds) {
				deleteMark(entityId, token);
			}
		});
	};
}

/**
 * The entity's restart state across every mark on it: `down` if any mark is, `proxyRefuses` if any
 * mark does, and the label of the strongest mark.
 */
export function getRestartState(entityId: string | undefined): RestartState | undefined {
	if (!entityId) { return undefined; }
	const now = Date.now();
	let state: RestartState | undefined;
	for (const mark of marks.get(entityId)?.values() ?? []) {
		if (mark.expiresAt <= now) { continue; }
		const proxyRefuses = mark.proxyRefuses || !!state?.proxyRefuses;
		state = !state || (mark.reach === 'down' && state.reach !== 'down')
			? { reach: mark.reach, proxyRefuses, label: mark.label }
			: { ...state, proxyRefuses };
	}
	return state;
}

export function isRestarting(entityId: string | undefined): boolean {
	return getRestartState(entityId) !== undefined;
}

/** Whether a client should hold its requests for an entity in this state. */
export function holdsRequests(state: RestartState | undefined, { proxied }: { proxied: boolean }): boolean {
	return !!state && (state.reach === 'down' || (proxied && state.proxyRefuses));
}

/**
 * Resolve once a client of this kind may send to the entity again (see {@link holdsRequests}).
 * Rejects with `signal.reason` if aborted first.
 */
export function waitUntilReachable(
	entityId: string,
	{ proxied, signal }: { proxied: boolean; signal?: AbortSignal },
): Promise<void> {
	const held = () => holdsRequests(getRestartState(entityId), { proxied });
	if (!held()) {
		return Promise.resolve();
	}
	return new Promise((resolve, reject) => {
		const check = () => {
			if (signal?.aborted) {
				cleanup();
				reject(signal.reason);
			} else if (!held()) {
				cleanup();
				resolve();
			}
		};
		const unsubscribe = subscribeToRestarts(check);
		signal?.addEventListener('abort', check);
		function cleanup() {
			unsubscribe();
			signal?.removeEventListener('abort', check);
		}
	});
}

/** Bumped on every change, for `useSyncExternalStore` consumers that read several entities. */
export function getRestartTrackerVersion(): number {
	return version;
}

export function subscribeToRestarts(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Called with each entity id that stops being tracked — released, cleared by CM, or expired. */
export function onRestartSettled(listener: (entityId: string) => void): () => void {
	settledListeners.add(listener);
	return () => settledListeners.delete(listener);
}

interface ClusterLike {
	id?: string;
	status?: string;
	instances?: ReadonlyArray<{ id?: string; status?: string }>;
}

/**
 * Mirror central manager's container-op statuses for one cluster record.
 *
 * An instance in a transitional status is `down`. The cluster is `down` only when every live member
 * is — a parallel restart, or a single-node cluster — and `rolling` otherwise, since a rolling
 * restart keeps the cluster serving through the members not currently restarting. Either way the
 * proxy refuses it until CM settles the status.
 *
 * `observedAt` is when the request for this record was sent. A mark written after that (by the
 * container-op response itself) is newer than anything this record can say, so it is not cleared.
 */
export function syncRestartsFromCluster(cluster: ClusterLike | undefined, observedAt = Date.now()) {
	if (!cluster?.id) { return; }
	const clusterId = cluster.id;
	const expiresAt = observedAt + CONTAINER_MARK_TTL_MS;
	const liveInstances = (cluster.instances ?? []).filter(
		(instance) => instance.id && !TERMINAL_INSTANCE_STATUSES.has(instance.status ?? ''),
	);
	mutate(() => {
		for (const instance of liveInstances) {
			const label = COMING_BACK_LABELS[instance.status ?? ''];
			if (label) {
				setMark(instance.id!, CONTAINER_TOKEN, {
					reach: 'down',
					proxyRefuses: true,
					label,
					setAt: observedAt,
					expiresAt,
				});
			} else {
				deleteMark(instance.id!, CONTAINER_TOKEN, observedAt);
			}
		}
		const label = COMING_BACK_LABELS[cluster.status ?? ''];
		if (label) {
			const allDown = liveInstances.length > 0
				&& liveInstances.every((instance) => UNREACHABLE_STATUSES.has(instance.status ?? ''));
			setMark(clusterId, CONTAINER_TOKEN, {
				reach: allDown ? 'down' : 'rolling',
				proxyRefuses: true,
				label,
				setAt: observedAt,
				expiresAt,
			});
		} else {
			deleteMark(clusterId, CONTAINER_TOKEN, observedAt);
		}
	});
}

/**
 * Record a container op CM just accepted, ahead of the next cluster fetch. A parallel op takes
 * every listed instance down at once; a rolling one leaves the per-instance detail to the sync.
 */
export function markContainerOpAccepted(
	{ clusterId, instanceIds, label, allAtOnce }: {
		clusterId?: string;
		instanceIds: readonly string[];
		label: string;
		allAtOnce: boolean;
	},
) {
	const now = Date.now();
	const mark = { proxyRefuses: true, label, setAt: now, expiresAt: now + CONTAINER_MARK_TTL_MS };
	mutate(() => {
		if (clusterId) {
			setMark(clusterId, CONTAINER_TOKEN, { ...mark, reach: allAtOnce ? 'down' : 'rolling' });
		}
		if (allAtOnce || !clusterId) {
			for (const instanceId of instanceIds) {
				setMark(instanceId, CONTAINER_TOKEN, { ...mark, reach: 'down' });
			}
		}
	});
}

/** Test-only: forget every mark. Listeners stay — the app's own are registered at module load. */
export function resetRestartTracker() {
	clearTimeout(expiryTimer);
	expiryTimer = undefined;
	marks.clear();
}
