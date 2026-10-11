import { Cluster, SchemaOrganizationDomain } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { describeClusterNotChangeable, describeUnsendableDomainChange } from './describeDomainChangeRefusal';

function clusterWith(fields: Partial<Cluster> = {}): Cluster {
	return {
		id: 'clu-1',
		organizationId: 'org-1',
		status: 'RUNNING',
		plans: [{ planId: 'standard' }],
		...fields,
	} as Cluster;
}

function instance(status: string) {
	return { id: 'ins-1', instanceFqdn: 'node-1.example.com', status } as NonNullable<Cluster['instances']>[number];
}

describe('describeClusterNotChangeable', () => {
	it('lets a running cluster whose instances are all running or gone change', () => {
		expect(describeClusterNotChangeable(clusterWith())).toBeUndefined();
		expect(
			describeClusterNotChangeable(
				clusterWith({ instances: [instance('RUNNING'), instance('TERMINATED'), instance('REMOVED')] }),
			),
		).toBeUndefined();
	});

	it.each(['UPDATING', 'STOPPED', 'FAILED', 'PROVISIONING', undefined])('refuses a cluster that is %s', (status) => {
		expect(describeClusterNotChangeable(clusterWith({ status }))?.needsSupport).toBe(false);
	});

	// Central manager's TRANSITIONING_INSTANCE_STATES, as of central-manager 38449f3f.
	it.each([
		'PROVISIONING',
		'PENDING_UPGRADE',
		'DRAINING',
		'UPDATING',
		'UPDATED',
		'CLONE_PENDING',
		'CLONE_READY',
		'CLONING',
		'UPDATING_HDB_NODES',
		'GENERATE_TOKEN',
		'TOKEN_GENERATED',
		'STOPPING',
		'STOPPED',
		'STARTING',
		'RESTARTING',
	])('refuses while an instance is %s, naming it', (status) => {
		const refusal = describeClusterNotChangeable(clusterWith({ instances: [instance(status)] }));
		expect(refusal).toEqual({
			message: expect.stringContaining(`node-1.example.com is ${status}`),
			needsSupport: false,
		});
	});

	it('refuses while an instance has failed, and says only support can clear it', () => {
		expect(describeClusterNotChangeable(clusterWith({ instances: [instance('FAILED')] }))).toEqual({
			message: expect.stringContaining('node-1.example.com has failed'),
			needsSupport: true,
		});
	});

	it('leaves a status it does not know to central manager', () => {
		expect(describeClusterNotChangeable(clusterWith({ instances: [instance('ERROR')] }))).toBeUndefined();
		expect(describeClusterNotChangeable(clusterWith({ instances: [instance('SOMETHING_NEW')] }))).toBeUndefined();
	});
});

describe('describeUnsendableDomainChange', () => {
	const bound = {
		id: 'dom-a',
		domain: 'a.example.com',
		status: 'ACTIVE',
		clusterId: 'clu-1',
	} as SchemaOrganizationDomain;
	const free = { id: 'dom-c', domain: 'c.example.com', status: 'ACTIVE' } as SchemaOrganizationDomain;
	const held = clusterWith({ domainIds: ['dom-a'] });

	it('lets a change through when every domain it touches is acceptable', () => {
		expect(describeUnsendableDomainChange(held, { add: ['dom-c'], remove: undefined }, [bound, free])).toBeUndefined();
		expect(describeUnsendableDomainChange(held, { add: [], remove: 'dom-a' }, [bound, free])).toBeUndefined();
	});

	it('lets a bind adopt a domain already bound here that the cluster does not list', () => {
		expect(
			describeUnsendableDomainChange(clusterWith({ domainIds: [] }), { add: ['dom-a'], remove: undefined }, [bound]),
		).toBeUndefined();
	});

	it('refuses any change to a self-managed cluster', () => {
		const selfManaged = clusterWith({ domainIds: ['dom-a'], plans: [{ planId: 'self-hosted' }] as Cluster['plans'] });
		expect(describeUnsendableDomainChange(selfManaged, { add: [], remove: 'dom-a' }, [bound])?.message).toMatch(
			/self-managed/,
		);
	});

	it.each([
		['missing from the list', [free], "isn't one of this organization's domains"],
		['not verified', [{ ...bound, status: 'PENDING_VALIDATION' }, free], 'is not verified'],
		['bound to another cluster', [{ ...bound, clusterId: 'clu-2' }, free], 'is bound to cluster clu-2'],
	])('refuses every change while a domain the cluster lists is %s, pointing at support', (_case, domains, problem) => {
		expect(describeUnsendableDomainChange(held, { add: ['dom-c'], remove: undefined }, domains)).toEqual({
			message: expect.stringContaining(problem),
			needsSupport: true,
		});
	});

	it('refuses unbinding a listed domain another cluster holds, since central manager would unbind it there', () => {
		expect(
			describeUnsendableDomainChange(held, { add: [], remove: 'dom-a' }, [{ ...bound, clusterId: 'clu-2' }]),
		).toEqual({ message: expect.stringContaining('is bound to cluster clu-2'), needsSupport: true });
	});

	it.each([
		['missing from the list', [bound], "dom-c isn't one of this organization's domains"],
		['not verified', [bound, { ...free, status: 'PENDING_VALIDATION' }], 'c.example.com is not verified'],
		['bound to another cluster', [bound, { ...free, clusterId: 'clu-2' }], 'c.example.com is bound to cluster clu-2'],
	])('refuses binding a domain that is %s, without pointing at support', (_case, domains, problem) => {
		expect(describeUnsendableDomainChange(held, { add: ['dom-c'], remove: undefined }, domains)).toEqual({
			message: expect.stringContaining(problem),
			needsSupport: false,
		});
	});

	it('refuses unbinding a domain the cluster does not list', () => {
		const unlisted = clusterWith({ domainIds: [] });
		expect(describeUnsendableDomainChange(unlisted, { add: [], remove: 'dom-a' }, [bound])).toEqual({
			message: expect.stringContaining('without the cluster listing it'),
			needsSupport: true,
		});
		expect(
			describeUnsendableDomainChange(unlisted, { add: [], remove: 'dom-c' }, [free]),
		).toEqual({ message: expect.stringContaining('is no longer bound to this cluster'), needsSupport: false });
	});
});
