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
	switch (value) {
		case 'PROVISIONING':
		case 'CLONE_PENDING':
		case 'CLONING':
		case 'CLONE_READY':
		case 'UPDATING_HDB_NODES':
		case 'UPDATING':
			return 'warning';
		case 'RUNNING':
		case 'UPDATED':
			return 'success';
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
