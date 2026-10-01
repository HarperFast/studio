import type { Cluster, Instance } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { allClusterInstancesRunning, allClusterInstancesSettled } from './allInstancesRunning';

function makeCluster(statuses: (string | undefined)[]): Cluster {
	return {
		id: 'clu-1',
		instances: statuses.map((status, i) => ({ id: `ins-${i}`, status } as Instance)),
	} as Cluster;
}

describe('allClusterInstancesRunning', () => {
	it('is true when every instance is running', () => {
		expect(allClusterInstancesRunning(makeCluster(['RUNNING', 'RUNNING']))).toBe(true);
		expect(allClusterInstancesRunning(makeCluster(['RUNNING', 'UPDATED']))).toBe(true);
	});

	it('is false while any instance is still cloning or provisioning', () => {
		expect(allClusterInstancesRunning(makeCluster(['RUNNING', 'CLONING']))).toBe(false);
		expect(allClusterInstancesRunning(makeCluster(['RUNNING', 'CLONE_PENDING']))).toBe(false);
		expect(allClusterInstancesRunning(makeCluster(['RUNNING', 'CLONE_READY']))).toBe(false);
		expect(allClusterInstancesRunning(makeCluster(['PROVISIONING']))).toBe(false);
	});

	it('treats an instance with no status as not running', () => {
		expect(allClusterInstancesRunning(makeCluster(['RUNNING', undefined]))).toBe(false);
	});

	it('ignores deleted instances', () => {
		expect(allClusterInstancesRunning(makeCluster(['RUNNING', 'TERMINATED']))).toBe(true);
		expect(allClusterInstancesRunning(makeCluster(['RUNNING', 'TERMINATING', 'REMOVED']))).toBe(true);
		// ... but a cluster with ONLY deleted instances is not ready.
		expect(allClusterInstancesRunning(makeCluster(['TERMINATED']))).toBe(false);
	});

	it('is false with no cluster or no instance data', () => {
		expect(allClusterInstancesRunning(undefined)).toBe(false);
		expect(allClusterInstancesRunning({ id: 'clu-1' } as Cluster)).toBe(false);
		expect(allClusterInstancesRunning(makeCluster([]))).toBe(false);
	});
});

describe('allClusterInstancesSettled', () => {
	it('is true when every instance is running', () => {
		expect(allClusterInstancesSettled(makeCluster(['RUNNING', 'UPDATED']))).toBe(true);
	});

	it('is false while any instance is still cloning, provisioning or updating', () => {
		for (
			const status of [
				'CLONE_PENDING',
				'CLONE_READY',
				'CLONING',
				'PROVISIONING',
				'PENDING_UPGRADE',
				'UPDATING',
				'DRAINING',
				'UPDATING_HDB_NODES',
				'GENERATE_TOKEN',
				'RESTARTING',
			]
		) {
			expect(allClusterInstancesSettled(makeCluster(['RUNNING', status])), status).toBe(false);
		}
	});

	it('lets an instance at rest outside RUNNING settle, so a scale-up of a cluster with a stopped member finishes', () => {
		expect(allClusterInstancesSettled(makeCluster(['RUNNING', 'STOPPED']))).toBe(true);
		expect(allClusterInstancesSettled(makeCluster(['RUNNING', 'ERROR', 'FAILED']))).toBe(true);
	});

	it('treats a missing or unknown status as still in progress', () => {
		expect(allClusterInstancesSettled(makeCluster(['RUNNING', undefined]))).toBe(false);
		expect(allClusterInstancesSettled(makeCluster(['RUNNING', 'SOME_NEW_STATUS']))).toBe(false);
	});

	it('ignores deleted instances', () => {
		expect(allClusterInstancesSettled(makeCluster(['RUNNING', 'TERMINATING', 'TERMINATED', 'REMOVED']))).toBe(true);
	});

	it('has nothing in progress without instances', () => {
		expect(allClusterInstancesSettled({ id: 'clu-1' } as Cluster)).toBe(true);
		expect(allClusterInstancesSettled(makeCluster([]))).toBe(true);
	});
});
