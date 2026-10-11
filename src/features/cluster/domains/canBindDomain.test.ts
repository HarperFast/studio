import { Cluster, SchemaOrganizationDomain } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { bindableDomainIds, canBindDomain } from './canBindDomain';

const cluster = { id: 'clu-1', plans: [{ planId: 'standard' }] } as Cluster;
const domain = { id: 'dom-1', domain: 'a.example.com', status: 'ACTIVE' } as SchemaOrganizationDomain;

describe('canBindDomain', () => {
	it('offers a verified domain that no cluster holds', () => {
		expect(canBindDomain(domain, cluster)).toBe(true);
	});

	it('does not offer a domain still awaiting verification', () => {
		expect(canBindDomain({ ...domain, status: 'PENDING_VALIDATION' }, cluster)).toBe(false);
	});

	it('does not offer a domain bound to any cluster, this one included', () => {
		expect(canBindDomain({ ...domain, clusterId: 'clu-2' }, cluster)).toBe(false);
		expect(canBindDomain({ ...domain, clusterId: 'clu-1' }, cluster)).toBe(false);
	});

	it('offers nothing to a self-managed cluster', () => {
		expect(canBindDomain(domain, { ...cluster, plans: [{ planId: 'self-hosted' }] } as Cluster)).toBe(false);
	});
});

describe('bindableDomainIds', () => {
	const other = { ...domain, id: 'dom-2', domain: 'b.example.com' };

	it('keeps the ticked ids the list still offers, in the order they were ticked', () => {
		expect(bindableDomainIds(['dom-2', 'dom-1'], [domain, other], cluster)).toEqual(['dom-2', 'dom-1']);
	});

	it('drops a ticked id the list no longer has, or no longer offers', () => {
		expect(bindableDomainIds(['dom-1', 'dom-2'], [{ ...domain, clusterId: 'clu-2' }], cluster)).toEqual([]);
	});

	it('offers nothing before the list has loaded', () => {
		expect(bindableDomainIds(['dom-1'], undefined, cluster)).toEqual([]);
	});
});
