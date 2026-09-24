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

/** A cluster read sent this soon after CM accepted an op is not trusted to clear it: another CM node
 *  can still be serving the pre-op status. */
const ACCEPTED_OP_GRACE_MS = 5_000;

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
/**
 * Per entity, when the newest central-manager observation applied to it was requested. It outlives
 * the mark, so a slower response to an older request can neither resurrect a cleared restart nor
 * overwrite a newer one.
 */
const containerObservedAt = new Map<string, number>();
const listeners = new Set<() => void>();
const settledListeners = new Set<(entityId: string) => void>();
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let version = 0;
/** The effective states subscribers last heard about. Compared against, rather than a before-change
 *  snapshot, because an expired mark already reads as gone before the timer's mutate runs. */
let publishedStates = '';

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

function effectiveStates(): string {
	const states: string[] = [];
	for (const entityId of marks.keys()) {
		const state = getRestartState(entityId);
		if (state) {
			states.push(`${entityId}:${state.reach}:${state.proxyRefuses}:${state.label}`);
		}
	}
	return states.sort().join('|');
}

/**
 * Apply a change, then notify only if some entity's effective state moved — a poll that merely
 * extends a mark's expiry is not news. Settled notifications are deferred a tick: a sync runs inside
 * the cluster query's own fetch, and a listener that invalidates queries would otherwise cancel the
 * very fetch that reported the recovery.
 */
function mutate(change: () => void) {
	const trackedBefore = new Set(marks.keys());
	change();
	purgeExpired(Date.now());
	scheduleExpiry();
	const states = effectiveStates();
	if (states !== publishedStates) {
		publishedStates = states;
		version += 1;
		for (const listener of listeners) {
			listener();
		}
	}
	const settled = [...trackedBefore].filter((entityId) => !marks.has(entityId));
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

function deleteMark(entityId: string, token: symbol) {
	const byToken = marks.get(entityId);
	if (byToken?.delete(token) && byToken.size === 0) {
		marks.delete(entityId);
	}
}

/** Whether a CM observation requested at `observedAt` is at least as new as what was applied. */
function claimObservation(entityId: string, observedAt: number): boolean {
	if (observedAt < (containerObservedAt.get(entityId) ?? -Infinity)) {
		return false;
	}
	containerObservedAt.set(entityId, observedAt);
	return true;
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
	const expiresAt = Date.now() + ttlMs;
	mutate(() => {
		for (const entityId of entityIds) {
			setMark(entityId, token, { reach, proxyRefuses: false, label, expiresAt });
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
	if (signal?.aborted) {
		return Promise.reject(signal.reason);
	}
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
 * `observedAt` is when the request for this record was sent; see `containerObservedAt`.
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
			if (!claimObservation(instance.id!, observedAt)) { continue; }
			const label = COMING_BACK_LABELS[instance.status ?? ''];
			if (label) {
				setMark(instance.id!, CONTAINER_TOKEN, { reach: 'down', proxyRefuses: true, label, expiresAt });
			} else {
				deleteMark(instance.id!, CONTAINER_TOKEN);
			}
		}
		if (!claimObservation(clusterId, observedAt)) { return; }
		const label = COMING_BACK_LABELS[cluster.status ?? ''];
		if (label) {
			const allDown = liveInstances.length > 0
				&& liveInstances.every((instance) => UNREACHABLE_STATUSES.has(instance.status ?? ''));
			setMark(clusterId, CONTAINER_TOKEN, {
				reach: allDown ? 'down' : 'rolling',
				proxyRefuses: true,
				label,
				expiresAt,
			});
		} else {
			deleteMark(clusterId, CONTAINER_TOKEN);
		}
	});
}

/**
 * Record a container op CM just accepted, ahead of the next cluster fetch. A parallel op takes every
 * listed instance down at once. A rolling one's instances are only known to be refused by the proxy
 * until the next fetch says which member is restarting.
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
	const mark = { proxyRefuses: true, label, expiresAt: now + CONTAINER_MARK_TTL_MS };
	const reach: RestartReach = allAtOnce ? 'down' : 'rolling';
	mutate(() => {
		for (const entityId of clusterId ? [clusterId, ...instanceIds] : instanceIds) {
			containerObservedAt.set(entityId, now + ACCEPTED_OP_GRACE_MS);
			setMark(entityId, CONTAINER_TOKEN, { ...mark, reach });
		}
	});
}

/** Test-only: forget every mark. Listeners stay — the app's own are registered at module load. */
export function resetRestartTracker() {
	clearTimeout(expiryTimer);
	expiryTimer = undefined;
	marks.clear();
	containerObservedAt.clear();
	publishedStates = '';
}
