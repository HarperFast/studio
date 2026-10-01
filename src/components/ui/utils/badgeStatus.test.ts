import { describe, expect, it } from 'vitest';
import { isOperationsProxyRefused } from './badgeStatus';

describe('isOperationsProxyRefused', () => {
	// central-manager `INACTIVE_STATES` (src/constants/sharedConstants.js), which
	// `HDBInstance`'s operation proxy answers with `400 "Instance is not active"`.
	const refusedByCentralManager = [
		'TERMINATING',
		'TERMINATED',
		'REMOVED',
		'ERROR',
		'FAILED',
		'STOPPING',
		'STOPPED',
		'STARTING',
		'RESTARTING',
	];

	it.each(refusedByCentralManager)('is true for %s', status => {
		expect(isOperationsProxyRefused(status)).toBe(true);
	});

	it.each(['RUNNING', 'UPDATED', 'PROVISIONING', 'UPDATING', 'PENDING_UPGRADE', undefined])(
		'is false for %s',
		status => {
			expect(isOperationsProxyRefused(status)).toBe(false);
		},
	);
});
