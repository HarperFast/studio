import { describe, expect, it } from 'vitest';
import { isCloning, isMintingCloneToken, isOperationsProxyRefused } from './badgeStatus';

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

describe('isCloning', () => {
	it('matches exactly the clone statuses central manager tracks progress for', () => {
		for (const status of ['CLONE_PENDING', 'CLONE_READY', 'CLONING']) {
			expect(isCloning(status), status).toBe(true);
		}
		for (const status of ['RUNNING', 'PROVISIONING', 'GENERATE_TOKEN', undefined]) {
			expect(isCloning(status), String(status)).toBe(false);
		}
	});
});

describe('isMintingCloneToken', () => {
	it('matches the two statuses the leader passes through while minting a clone token', () => {
		expect(isMintingCloneToken('GENERATE_TOKEN')).toBe(true);
		expect(isMintingCloneToken('TOKEN_GENERATED')).toBe(true);
		for (const status of ['RUNNING', 'CLONE_PENDING', undefined]) {
			expect(isMintingCloneToken(status), String(status)).toBe(false);
		}
	});
});
