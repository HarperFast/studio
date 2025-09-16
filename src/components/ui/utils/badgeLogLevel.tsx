export type BadgeLogLevelVariant =
	| 'notify'
	| 'error'
	| 'warn'
	| 'info'
	| 'debug'
	| 'trace'
	| 'stderr'
	| 'stdout'
	| undefined;

type BadgeStatusVariantValues = 'warning' | 'success' | 'secondary' | 'destructive';

export function renderBadgeLogLevelVariant(value: BadgeLogLevelVariant): BadgeStatusVariantValues {
	switch (value) {
		case 'warn':
			return 'warning';
		case 'notify':
			return 'success';
		case 'info':
		case 'debug':
		case 'trace':
		case undefined:
		case 'stdout':
			return 'secondary';
		case 'stderr':
		case 'error':
			return 'destructive';
		default:
			return value;
	}
}
