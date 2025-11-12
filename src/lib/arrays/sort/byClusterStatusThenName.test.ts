import { Cluster } from '@/lib/api.patch';
import { byClusterStatusThenName } from '@/lib/arrays/sort/byClusterStatusThenName';
import { describe, expect, it } from 'vitest';

describe('byClusterStatusThenName', () => {
	const clusterDefaults: Cluster = {
		abbreviatedName: '',
		id: '',
		name: '',
		organizationId: '',
		status: 'RUNNING',
	};

	it('should sort by names', () => {
		const clusters = [
			{ ...clusterDefaults, name: 'Cluster D' },
			{ ...clusterDefaults, name: 'Cluster A' },
			{ ...clusterDefaults, name: 'Cluster C' },
			{ ...clusterDefaults, name: 'Cluster B' },
		];
		clusters.sort(byClusterStatusThenName);
		expect(clusters.map(c => c.name)).toEqual([
			'Cluster A',
			'Cluster B',
			'Cluster C',
			'Cluster D',
		]);
	});

	it('should sort by status', () => {
		const clusters = [
			{ ...clusterDefaults, status: 'PROVISIONING' },
			{ ...clusterDefaults, status: 'TERMINATED' },
			{ ...clusterDefaults, status: 'FAILED' },
			{ ...clusterDefaults, status: 'UPDATING' },
			{ ...clusterDefaults, status: 'RUNNING' },
			{ ...clusterDefaults, status: 'PROVISIONING' },
			{ ...clusterDefaults, status: 'UPDATING' },
			{ ...clusterDefaults, status: 'RUNNING' },
			{ ...clusterDefaults, status: 'TERMINATED' },
			{ ...clusterDefaults, status: 'UPDATING' },
		];
		clusters.sort(byClusterStatusThenName);
		expect(clusters.map(c => c.status)).toEqual([
			'FAILED',
			'UPDATING',
			'UPDATING',
			'UPDATING',
			'PROVISIONING',
			'PROVISIONING',
			'RUNNING',
			'RUNNING',
			'TERMINATED',
			'TERMINATED',
		]);
	});
});
