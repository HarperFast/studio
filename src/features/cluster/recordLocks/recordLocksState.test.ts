import { Cluster, Instance } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { recordLocksBlocker, recordLocksState, supportsRecordLocks } from './recordLocksState';

function instance(overrides: Partial<Instance> = {}): Instance {
	return { id: 'ins-1', status: 'RUNNING', version: '5.3.1', ...overrides } as Instance;
}

function cluster(overrides: Partial<Cluster> = {}): Cluster {
	return {
		id: 'clu-1',
		name: 'locks',
		organizationId: 'org-1',
		status: 'RUNNING',
		plans: [{ planId: 'shared-basic' }],
		instances: [instance({ id: 'ins-1' }), instance({ id: 'ins-2' })],
		...overrides,
	} as Cluster;
}

describe('supportsRecordLocks', () => {
	it.each([
		['5.3.0', true],
		['5.3.1', true],
		['5.4.0-alpha.1', true],
		['6.0.0', true],
		['v5.3.0', true],
		// central manager compares with semver.lt, which puts every 5.3.0 prerelease below 5.3.0
		['5.3.0-beta.4', false],
		['5.2.13', false],
		['4.7.40', false],
		// and refuses anything semver.valid rejects
		['5.3', false],
		['latest', false],
		['', false],
		[undefined, false],
		[null, false],
	])('%s → %s', (version, expected) => {
		expect(supportsRecordLocks(version)).toBe(expected);
	});
});

describe('recordLocksState', () => {
	it('reads a cluster without the field as off', () => {
		expect(recordLocksState(cluster())).toEqual({ enabled: false, phase: 'off', applied: 2, total: 2 });
	});

	it('is on once every member carries the setting', () => {
		const state = recordLocksState(cluster({
			recordLocks: true,
			instances: [instance({ id: 'a', recordLocks: true }), instance({ id: 'b', recordLocks: true })],
		}));
		expect(state).toEqual({ enabled: true, phase: 'on', applied: 2, total: 2 });
	});

	it('is applying while the cluster updates with members still to restart', () => {
		const state = recordLocksState(cluster({
			recordLocks: true,
			status: 'UPDATING',
			instances: [instance({ id: 'a', recordLocks: true }), instance({ id: 'b', status: 'PENDING_UPGRADE' })],
		}));
		expect(state).toEqual({ enabled: true, phase: 'applying', applied: 1, total: 2 });
	});

	it('has stopped when the cluster is running again with members left on the old setting', () => {
		// What handleRollFailure leaves: the failed member put back to its old value and marked FAILED.
		const state = recordLocksState(cluster({
			recordLocks: true,
			instances: [instance({ id: 'a', recordLocks: true }), instance({ id: 'b', status: 'FAILED' })],
		}));
		expect(state).toEqual({ enabled: true, phase: 'stopped', applied: 1, total: 2 });
	});

	it('counts a member turned off as null, the value central manager writes, as off', () => {
		const state = recordLocksState(cluster({
			recordLocks: false,
			instances: [
				instance({ id: 'a', recordLocks: null as unknown as boolean }),
				instance({ id: 'b', recordLocks: true }),
			],
		}));
		expect(state).toMatchObject({ enabled: false, phase: 'stopped', applied: 1 });
	});

	it('ignores members that are gone', () => {
		const state = recordLocksState(cluster({
			recordLocks: true,
			instances: [instance({ id: 'a', recordLocks: true }), instance({ id: 'b', status: 'TERMINATED' })],
		}));
		expect(state).toEqual({ enabled: true, phase: 'on', applied: 1, total: 1 });
	});
});

describe('recordLocksBlocker', () => {
	it('lets a running 5.3+ cluster turn them on and off', () => {
		expect(recordLocksBlocker(cluster(), true)).toBeNull();
		expect(recordLocksBlocker(cluster({ recordLocks: true }), false)).toBeNull();
	});

	it('refuses a self-hosted cluster', () => {
		expect(recordLocksBlocker(cluster({ plans: [{ planId: 'self-hosted-pro' }] } as Partial<Cluster>), true)?.message)
			.toBe("Record locks aren't available on self-hosted clusters.");
	});

	it('waits for an updating cluster', () => {
		expect(recordLocksBlocker(cluster({ status: 'UPDATING' }), true)?.message)
			.toBe('The cluster is updating. Record locks can change once it is running again.');
	});

	it('refuses a cluster with no instances', () => {
		expect(recordLocksBlocker(cluster({ instances: [] }), true)?.message).toBe('The cluster has no instances yet.');
	});

	it('names a member that is not running, and asks for help with a failed one', () => {
		const stopped = cluster({ instances: [instance(), instance({ id: 'ins-2', name: 'edge-2', status: 'STOPPED' })] });
		expect(recordLocksBlocker(stopped, true)).toEqual({
			message: 'edge-2 is stopped. Every instance has to be running to change record locks.',
			needsSupport: false,
		});
		const failed = cluster({ instances: [instance({ id: 'ins-9', instanceFqdn: 'n9.example', status: 'FAILED' })] });
		expect(recordLocksBlocker(failed, false)).toEqual({
			message:
				'n9.example has failed. Every instance has to be running to change record locks, so it needs recovering first.',
			needsSupport: true,
		});
	});

	it('ignores members that are gone when checking status and version', () => {
		const withLeaver = cluster({
			instances: [instance(), instance({ id: 'old', status: 'TERMINATED', version: '4.7.0' })],
		});
		expect(recordLocksBlocker(withLeaver, true)).toBeNull();
	});

	it('refuses turning on below 5.3.0, naming the versions', () => {
		const old = cluster({ instances: [instance({ version: '5.2.13' }), instance({ id: 'b', version: '5.2.13' })] });
		expect(recordLocksBlocker(old, true)).toEqual({
			message: 'Record locks need Harper 5.3.0 or later, and 2 instances run 5.2.13. Upgrade the cluster first.',
			needsSupport: false,
			needsUpgrade: true,
		});
	});

	it('refuses turning on when a member reports no version', () => {
		const unknown = cluster({ instances: [instance(), instance({ id: 'b', version: undefined })] });
		expect(recordLocksBlocker(unknown, true)?.message).toBe(
			'Record locks need Harper 5.3.0 or later, and 1 instance runs an unknown version. Upgrade the cluster first.',
		);
	});

	it('lets a cluster below 5.3.0 turn them off, which central manager does not version-check', () => {
		const old = cluster({ recordLocks: true, instances: [instance({ version: '5.2.13' })] });
		expect(recordLocksBlocker(old, false)).toBeNull();
	});
});
