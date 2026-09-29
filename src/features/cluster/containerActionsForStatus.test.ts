import { describe, expect, it } from 'vitest';
import { containerActionsForStatus } from './containerActionsForStatus';

describe('containerActionsForStatus', () => {
	it('offers restart and stop for a running instance', () => {
		expect(containerActionsForStatus('RUNNING')).toEqual({ start: false, restart: true, stop: true });
	});

	it('offers only start for a stopped instance', () => {
		expect(containerActionsForStatus('STOPPED')).toEqual({ start: true, restart: false, stop: false });
	});

	it('offers every action for an instance at ERROR or FAILED, where a retry is what the operator needs', () => {
		for (const status of ['ERROR', 'FAILED']) {
			expect(containerActionsForStatus(status)).toEqual({ start: true, restart: true, stop: true });
		}
	});

	it('offers nothing mid-transition or in a lifecycle state a container op cannot start from', () => {
		for (
			const status of [
				'STOPPING',
				'STARTING',
				'RESTARTING',
				'PROVISIONING',
				'CLONING',
				'UPDATING',
				'TERMINATED',
				null,
				undefined,
			]
		) {
			expect(containerActionsForStatus(status)).toEqual({ start: false, restart: false, stop: false });
		}
	});
});
