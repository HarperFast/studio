import type { Cluster, Instance } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { buildClusterList, defaultClusterListControls, describeCluster, selectClusters } from './clusterListModel';

const cluster = (overrides: Partial<Cluster> = {}): Cluster => ({
	id: 'clu-a',
	name: 'Production',
	organizationId: 'org-a',
	status: 'RUNNING',
	...overrides,
});
const instance = (overrides: Partial<Instance> = {}): Instance => ({
	id: 'ins-a',
	clusterId: 'clu-a',
	cluster: cluster(),
	instanceFqdn: 'instance.example.test',
	operationsApiPort: 9925,
	operationsApiSecure: true,
	status: 'RUNNING',
	...overrides,
});

describe('cluster list model', () => {
	it('uses plan regions without nested instances and leaves missing metrics unknown', () => {
		const item = describeCluster(cluster({ plans: [{ planId: 'shared', region: 'US East' }] }));
		expect(item.regions).toEqual(['US East']);
		expect(item.instanceCount).toBeUndefined();
		expect(item.version).toBeUndefined();
		expect(item.label).toBe('Running');
		expect(item.hosting).toBe('Harper Cloud');
	});

	it('reports self-hosted lifecycle consistently without claiming monitored health', () => {
		const item = describeCluster(cluster({ plans: [{ planId: 'self-hosted' }] }));
		expect(item.category).toBe('running');
		expect(item.label).toBe('Running');
		expect(item.notices).toEqual([]);
	});

	it('resolves opaque region ids without requiring nested instances and tolerates an unavailable catalog', () => {
		const data = cluster({ plans: [{ planId: 'shared', regionId: 'reg-123' }] });
		expect(describeCluster(data).regions).toEqual([]);
		const model = buildClusterList([data], new Map([['reg-123', 'US East']]));
		expect(model.regions).toEqual(['US East']);
		expect(selectClusters(model.items, { ...defaultClusterListControls, search: 'East' })).toHaveLength(1);
	});

	it('includes completed updates in the running summary', () => {
		expect(describeCluster(cluster({ status: 'UPDATED' })).category).toBe('running');
	});

	it('retains unknown states without claiming that they are running', () => {
		expect(describeCluster(cluster({ status: undefined })).label).toBe('Status unknown');
		expect(describeCluster(cluster({ status: 'NEW_SERVER_STATE' })).category).toBe('other');
	});

	it.each(['FAILED', 'ERROR'])('prioritizes %s over setup and pending upgrades', status => {
		const item = describeCluster(
			cluster({ status, resetPassword: true, instances: [instance({ status: 'PENDING_UPGRADE' })] }),
		);
		expect(item.category).toBe('failed');
		expect(item.notices).toEqual(['Failure reported', 'Upgrade pending', 'Setup required']);
	});

	it.each([
		'PROVISIONING',
		'CLONING',
		'CLONE_READY',
		'CLONE_PENDING',
		'UPDATING_HDB_NODES',
		'DRAINING',
		'UPDATING',
		'PENDING_UPGRADE',
		'STOPPED',
		'PARTIAL',
		'STARTING',
		'STOPPING',
		'RESTARTING',
	])(
		'puts %s in attention without claiming a critical failure',
		status => {
			expect(describeCluster(cluster({ status })).category).toBe('attention');
		},
	);

	it('ignores retired instances for failures, regions, versions and counts', () => {
		const item = describeCluster(cluster({
			instances: [
				instance({ version: '5.0.32', region: 'US East' }),
				instance({ id: 'old', status: 'TERMINATED', version: '4.0.0', region: 'US West' }),
			],
		}));
		expect(item.instanceCount).toBe(1);
		expect(item.regions).toEqual(['US East']);
		expect(item.version).toBe('5.0.32');
		expect(item.notices).toEqual([]);
	});

	it('uses plan region labels without duplicating instance region ids', () => {
		const item = describeCluster(
			cluster({
				plans: [{ planId: 'shared', region: 'US East', regionId: 'use1' }],
				instances: [instance({ regionId: 'use1' })],
			}),
		);
		expect(item.regions).toEqual(['US East']);
	});

	it('surfaces a failed instance even when the cluster lifecycle still reports running', () => {
		const item = describeCluster(cluster({ instances: [instance({ status: 'FAILED' })] }));
		expect(item.category).toBe('failed');
		expect(item.label).toBe('Instance failure');
		expect(item.notices).toEqual(['Failure reported']);
	});

	it('reports mixed versions only when live instance versions are available', () => {
		const item = describeCluster(
			cluster({ instances: [instance({ version: '5.0.31' }), instance({ version: '5.0.32' })] }),
		);
		expect(item.version).toBe('Mixed versions');
		expect(item.notices).toEqual(['1 instance on an older version']);
		expect(item.category).toBe('attention');
	});

	it('preserves termination progress while excluding retired clusters from every surface', () => {
		const model = buildClusterList(
			['RUNNING', 'FAILED', 'STOPPED', 'TERMINATING', 'TERMINATED', 'REMOVED'].map(status =>
				cluster({ id: status, status })
			),
		);
		expect(model.items.map(item => item.cluster.id)).toEqual(['RUNNING', 'FAILED', 'STOPPED', 'TERMINATING']);
		expect(model.counts).toEqual({ running: 1, failed: 1, attention: 1, other: 1 });
	});

	it('combines search, category and region without changing summary counts or the source', () => {
		const source = [
			cluster({ status: 'FAILED', fqdn: 'api.example.test', plans: [{ planId: 'shared', regionId: 'us-east' }] }),
			cluster({ id: 'clu-b' }),
		];
		const model = buildClusterList(source, new Map([['us-east', 'us-east']]));
		expect(
			selectClusters(model.items, {
				...defaultClusterListControls,
				search: ' API.EXAMPLE ',
				region: 'us-east',
				category: 'failed',
			}).map(item => item.cluster.id),
		).toEqual(['clu-a']);
		expect(selectClusters(model.items, { ...defaultClusterListControls, region: 'us-west' })).toEqual([]);
		expect(model.counts.running).toBe(1);
		expect(source.map(item => item.id)).toEqual(['clu-a', 'clu-b']);
	});

	it('searches ids, custom hostnames and regions', () => {
		const model = buildClusterList([
			cluster({ domains: [{ domain: 'custom.example.test' }], plans: [{ planId: 'shared', region: 'Europe' }] }),
		]);
		for (const search of ['clu-a', 'custom.example', 'europe']) {
			expect(selectClusters(model.items, { ...defaultClusterListControls, search })).toHaveLength(1);
		}
	});

	it('sorts deterministically with missing, invalid and equal dates', () => {
		const model = buildClusterList([
			cluster({ id: 'b', name: 'Same', createdAt: 'bad' }),
			cluster({ id: 'a', name: 'Same' }),
			cluster({ id: 'new', createdAt: '2026-09-01' }),
			cluster({ id: 'older', createdAt: '2026-08-01' }),
		]);
		expect(selectClusters(model.items, { ...defaultClusterListControls, sort: 'newest' }).map(item => item.cluster.id))
			.toEqual(['new', 'older', 'a', 'b']);
		expect(model.items[0].cluster.id).toBe('b');
	});

	it('sorts failures before attention and then uses name and id as stable tie-breakers', () => {
		const model = buildClusterList([
			cluster(),
			cluster({ id: 'stopped', status: 'STOPPED' }),
			cluster({ id: 'failure', status: 'FAILED' }),
		]);
		expect(selectClusters(model.items, defaultClusterListControls).map(item => item.cluster.id)).toEqual([
			'failure',
			'stopped',
			'clu-a',
		]);
	});
});
