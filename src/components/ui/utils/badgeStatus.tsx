export type BadgeStatusVariant =
	| string
	| 'PROVISIONING'
	| 'CLONE_PENDING'
	| 'UPDATING_HDB_NODES'
	| 'UPDATING'
	| 'CLONE_READY'
	| 'RUNNING'
	| 'UPDATED'
	| 'STOPPED'
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
			return 'secondary';
		case 'TERMINATING':
		case 'TERMINATED':
		case 'REMOVED':
		case 'ERROR':
			return 'destructive';
		default:
			return 'default';
	}
}

export function isRunning(value: string | undefined): boolean {
	switch (value) {
		case 'RUNNING':
		case 'UPDATED':
			return true;
		default:
			return false;
	}
}

export function isPendingUpdate(value: string | undefined): boolean {
	switch (value) {
		case 'CLONE_PENDING':
			return true;
		default:
			return false;
	}
}

export function isBeingUpdated(value: string | undefined): boolean {
	switch (value) {
		case 'PROVISIONING':
		case 'CLONING':
		case 'CLONE_READY':
		case 'UPDATING_HDB_NODES':
		case 'UPDATING':
			return true;
		default:
			return false;
	}
}
