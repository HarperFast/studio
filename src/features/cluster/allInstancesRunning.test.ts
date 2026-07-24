import type { Cluster, Instance } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { allClusterInstancesRunning } from './allInstancesRunning';

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
