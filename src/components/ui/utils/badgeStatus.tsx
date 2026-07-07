export type BadgeStatusVariant =
	| string
	| 'PROVISIONING'
	| 'CLONE_PENDING'
	| 'PENDING_UPGRADE'
	| 'UPDATING_HDB_NODES'
	| 'DRAINING'
	| 'UPDATING'
	| 'CLONE_READY'
	| 'RUNNING'
	| 'UPDATED'
	| 'STOPPED'
	| 'FAILED'
	| 'TERMINATED'
	| 'TERMINATING'
	| 'ERROR'
	| 'REMOVED';

export type BadgeStatusVariantValues = 'warning' | 'success' | 'secondary' | 'destructive' | 'outline' | 'default';

export function renderBadgeStatusVariant(value: BadgeStatusVariant): BadgeStatusVariantValues {
	if (isPendingUpdate(value) || isBeingUpdated(value)) {
		return 'warning';
	}
	if (isRunning(value)) {
		return 'success';
	}
	switch (value) {
		case 'STOPPED':
			return 'destructive';
		case 'TERMINATING':
		case 'TERMINATED':
		case 'FAILED':
		case 'REMOVED':
		case 'ERROR':
			return 'destructive';
		default:
			return 'default';
	}
}

/**
 * The instance is stopped or mid container-lifecycle transition, so its ops API is unreachable.
 * Callers use this to suppress per-instance status polling (get_status) until it's back up.
 */
export function isStoppedOrTransitioning(value: string | undefined): boolean {
	switch (value) {
		case 'STOPPED':
		case 'STOPPING':
		case 'STARTING':
		case 'RESTARTING':
			return true;
		default:
			return false;
	}
}

export function isRunning(value: string | undefined): value is 'RUNNING' | 'UPDATED' {
	switch (value) {
		case 'RUNNING':
		case 'UPDATED':
			return true;
		default:
			return false;
	}
}

export function isFailed(value: string | undefined): value is 'FAILED' {
	switch (value) {
		case 'FAILED':
			return true;
		default:
			return false;
	}
}

export function isTerminated(value: string | undefined): value is 'TERMINATED' {
	switch (value) {
		case 'TERMINATED':
			return true;
		default:
			return false;
	}
}

export function isPendingUpdate(value: string | undefined): value is 'CLONE_PENDING' | 'PENDING_UPGRADE' {
	switch (value) {
		case 'CLONE_PENDING':
		case 'PENDING_UPGRADE':
			return true;
		default:
			return false;
	}
}

export function isBeingUpdated(
	value: string | undefined,
): value is 'PROVISIONING' | 'CLONING' | 'CLONE_READY' | 'UPDATING_HDB_NODES' | 'DRAINING' | 'UPDATING' {
	switch (value) {
		case 'PROVISIONING':
		case 'CLONING':
		case 'CLONE_READY':
		case 'UPDATING_HDB_NODES':
		case 'DRAINING':
		case 'UPDATING':
			return true;
		default:
			return false;
	}
}
