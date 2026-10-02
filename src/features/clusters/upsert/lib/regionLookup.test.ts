import { OrganizationRegion } from '@/integrations/api/api.patch';
import { SchemaRegion } from '@/integrations/api/api.gen';
import { describe, expect, it } from 'vitest';
import {
	buildRegionLookup,
	describeShape,
	isOrganizationRegionId,
	organizationRegionShape,
	regionAtQuantity,
	regionCohortKey,
} from './regionLookup';

const catalog: SchemaRegion[] = [
	{ id: 'us-1', region: 'US', latencyDescription: 'Low (1 region)', instanceCount: 2, purchasedBlockMultiplier: 1 },
	{ id: 'us-2', region: 'US', latencyDescription: 'Lower (2 regions)', instanceCount: 4, purchasedBlockMultiplier: 2 },
];

const orgRegion: OrganizationRegion = {
	id: 'oreg-1',
	organizationId: 'org-1',
	name: 'EU edge',
	placement: { linode: ['fr-par', 'fr-par', 'it-mil'], gcp: ['europe-west1'] },
	fallbackGroup: null,
	blocksPerUnit: 2,
	active: true,
};

describe('isOrganizationRegionId', () => {
	it('recognises the oreg- prefix only', () => {
		expect(isOrganizationRegionId('oreg-1')).toBe(true);
		expect(isOrganizationRegionId('us-1')).toBe(false);
		expect(isOrganizationRegionId(undefined)).toBe(false);
	});
});

describe('organizationRegionShape', () => {
	it('reads the provider list, defaulting to gcp', () => {
		expect(organizationRegionShape(orgRegion, 'linode')).toEqual(['fr-par', 'fr-par', 'it-mil']);
		expect(organizationRegionShape(orgRegion, undefined)).toEqual(['europe-west1']);
		expect(organizationRegionShape({ ...orgRegion, placement: {} }, 'linode')).toEqual([]);
	});
});

describe('buildRegionLookup', () => {
	const lookup = buildRegionLookup(catalog, [orgRegion], 'linode');

	it('keys catalog tiers and custom regions by id', () => {
		expect(lookup.get('us-2')).toMatchObject({ kind: 'catalog', name: 'US', instanceCount: 4, blocksPerUnit: 2 });
		expect(lookup.get('oreg-1')).toMatchObject({
			kind: 'organization',
			name: 'EU edge',
			shape: ['fr-par', 'fr-par', 'it-mil'],
			instanceCount: 3,
			blocksPerUnit: 2,
		});
	});

	it('treats a missing active flag as active', () => {
		const withoutActive: OrganizationRegion = { ...orgRegion };
		delete withoutActive.active;
		const built = buildRegionLookup([], [withoutActive], 'linode');
		expect(built.get('oreg-1')?.active).toBe(true);
		expect(buildRegionLookup([], [{ ...orgRegion, active: false }], 'linode').get('oreg-1')?.active).toBe(false);
	});

	it('tolerates undefined inputs', () => {
		expect(buildRegionLookup(undefined, undefined, undefined).size).toBe(0);
	});
});

describe('regionCohortKey', () => {
	const lookup = buildRegionLookup(catalog, [orgRegion], 'linode');

	it('groups catalog tiers by family name and custom regions by id', () => {
		expect(regionCohortKey(lookup.get('us-1')!)).toBe(regionCohortKey(lookup.get('us-2')!));
		expect(regionCohortKey(lookup.get('oreg-1')!)).toBe('oreg-1');
	});
});

describe('regionAtQuantity', () => {
	const lookup = buildRegionLookup(catalog, [orgRegion], 'linode');

	it('scales instances and blocks by the quantity', () => {
		expect(regionAtQuantity(lookup.get('oreg-1')!, 3)).toMatchObject({
			id: 'oreg-1',
			region: 'EU edge',
			latencyDescription: 'fr-par ×2 · it-mil',
			instanceCount: 9,
			purchasedBlockMultiplier: 6,
		});
	});

	it('leaves a catalog tier at one unit', () => {
		expect(regionAtQuantity(lookup.get('us-2')!, undefined)).toMatchObject({ instanceCount: 4, purchasedBlockMultiplier: 2 });
	});
});

describe('describeShape', () => {
	it('counts repeated datacenters', () => {
		expect(describeShape(['fr-par', 'fr-par', 'it-mil'])).toBe('fr-par ×2 · it-mil');
		expect(describeShape([])).toBe('');
	});
});
