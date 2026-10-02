import { OrganizationRegion } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { NO_FALLBACK, OrganizationRegionFormSchema, toCreatePayload, toFormValues, toPatch } from './OrganizationRegionFormSchema';

const stored: OrganizationRegion = {
	id: 'oreg-1',
	organizationId: 'org-1',
	name: 'EU edge',
	placement: { linode: ['fr-par', 'it-mil'], gcp: [] },
	fallbackGroup: 'europe',
	blocksPerUnit: 2,
	active: true,
};

const valid = {
	name: 'EU edge',
	linodeDatacenters: ['fr-par'],
	gcpDatacenters: [],
	fallbackGroup: NO_FALLBACK,
	blocksPerUnit: 1,
	active: true,
};

describe('OrganizationRegionFormSchema', () => {
	it('accepts a region with one provider populated', () => {
		expect(OrganizationRegionFormSchema.safeParse(valid).success).toBe(true);
	});

	it('requires at least one datacenter across providers', () => {
		const result = OrganizationRegionFormSchema.safeParse({ ...valid, linodeDatacenters: [] });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toEqual(['gcpDatacenters']);
		}
	});

	it.each([0, 11, 1.5])('rejects %s blocks per unit', (blocksPerUnit) => {
		expect(OrganizationRegionFormSchema.safeParse({ ...valid, blocksPerUnit }).success).toBe(false);
	});

	it('trims and requires the name', () => {
		expect(OrganizationRegionFormSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
		const parsed = OrganizationRegionFormSchema.safeParse({ ...valid, name: '  EU  ' });
		expect(parsed.success && parsed.data.name).toBe('EU');
	});
});

describe('toFormValues', () => {
	it('maps a stored row and defaults a new one', () => {
		expect(toFormValues(stored)).toEqual({
			name: 'EU edge',
			linodeDatacenters: ['fr-par', 'it-mil'],
			gcpDatacenters: [],
			fallbackGroup: 'europe',
			blocksPerUnit: 2,
			active: true,
		});
		expect(toFormValues(null)).toEqual({
			name: '',
			linodeDatacenters: [],
			gcpDatacenters: [],
			fallbackGroup: NO_FALLBACK,
			blocksPerUnit: 1,
			active: true,
		});
	});
});

describe('toCreatePayload', () => {
	it('stores the no-fallback choice as null', () => {
		expect(toCreatePayload('org-1', valid)).toEqual({
			organizationId: 'org-1',
			name: 'EU edge',
			placement: { linode: ['fr-par'], gcp: [] },
			fallbackGroup: null,
			blocksPerUnit: 1,
			active: true,
		});
	});
});

describe('toPatch', () => {
	it('sends only the fields that changed', () => {
		expect(toPatch(stored, toFormValues(stored))).toEqual({});
		expect(toPatch(stored, { ...toFormValues(stored), active: false })).toEqual({ active: false });
	});

	it('sends the whole placement when either provider list changes', () => {
		expect(toPatch(stored, { ...toFormValues(stored), gcpDatacenters: ['europe-west1'] })).toEqual({
			placement: { linode: ['fr-par', 'it-mil'], gcp: ['europe-west1'] },
		});
	});

	it('clears the fallback pool with null', () => {
		expect(toPatch(stored, { ...toFormValues(stored), fallbackGroup: NO_FALLBACK })).toEqual({ fallbackGroup: null });
	});
});
