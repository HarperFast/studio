import { Cluster } from '@/lib/api.patch';

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

const renderBadgeStatusVariant = (value: BadgeStatusVariant): BadgeStatusVariantValues => {
	switch (value) {
		case 'PROVISIONING':
		case 'CLONE_PENDING':
		case 'CLONE_READY':
		case 'UPDATING_HDB_NODES':
		case 'UPDATING':
			return 'warning';
		case 'RUNNING':
		case 'UPDATED':
			return 'success';
		case 'STOPPED':
			return 'secondary';
		case 'TERMINATED':
		case 'TERMINATING':
		case 'ERROR':
		case 'REMOVED':
		default:
			return 'destructive';
	}
};

const BADGE_STATUS_TEXT: Record<Exclude<Cluster['status'], undefined>, string> = {
	PROVISIONING: 'Provisioning',
	RUNNING: 'Running',
	STOPPED: 'Stopped',
	TERMINATED: 'Terminated',
	CLONE_PENDING: 'Clone Pending',
	UPDATING_HDB_NODES: 'Updating HDB Nodes',
	UPDATING: 'Updating',
	UPDATED: 'Updated',
	ERROR: 'Error',
	TERMINATING: 'Terminating',
	CLONE_READY: 'Clone Ready',
	REMOVED: 'Removed',
} as const;

export type BadgeStatus = keyof typeof BADGE_STATUS_TEXT;

const renderBadgeStatusText = (value: BadgeStatus) => {
	const status = BADGE_STATUS_TEXT[value];
	if (status) return status;
	throw new Error('Unsupported Status');
};

export { renderBadgeStatusVariant, renderBadgeStatusText };
