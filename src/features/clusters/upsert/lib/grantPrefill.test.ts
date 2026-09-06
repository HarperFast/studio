import { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { GrantShapeEntry } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { plansFromShape, prefillFromGrant } from './grantPrefill';

const plan = (id: string, deployment: string, performance: string) =>
	({ id, deploymentDescription: deployment, performanceDescription: performance }) as SchemaPlan;
const LEVEL_1 = plan('fabric-block-level-1', 'Colocated', 'Medium');
const DEDICATED = plan('fabric-block-dedicated-2', 'Dedicated', 'High');
const SELF_HOSTED = plan('self-hosted-2', 'Self-Hosted', 'Standard');
const PLANS = [LEVEL_1, DEDICATED, SELF_HOSTED];

const region = (id: string, name: string, latency: string) =>
	({ id, region: name, latencyDescription: latency }) as SchemaRegion;
const COLOCATED = [region('us-1', 'US', 'narrow'), region('eu-1', 'Europe', 'narrow')];
const DEDICATED_REGIONS = [region('us-ded', 'US', 'wide')];

const shape = (...entries: Array<[string, string | null]>): GrantShapeEntry[] =>
	entries.map(([planId, regionId]) => ({ planId, regionId }));
const prefill = (entries: GrantShapeEntry[] | null) =>
	prefillFromGrant({ shape: entries }, PLANS, COLOCATED, DEDICATED_REGIONS);

describe('prefillFromGrant', () => {
	it('is null for a grant without a shape, or whose plan the catalogue does not know', () => {
		expect(prefillFromGrant(null, PLANS, COLOCATED, DEDICATED_REGIONS)).toBeNull();
		expect(prefill(null)).toBeNull();
		expect(prefill([])).toBeNull();
		expect(prefill(shape(['plan-retired', 'us-1']))).toBeNull();
	});

	it('takes the first plan and the regions the shape pairs with it', () => {
		expect(prefill(shape([LEVEL_1.id, 'us-1'], [LEVEL_1.id, 'eu-1']))).toEqual({
			deploymentDescription: 'Colocated',
			performanceDescription: 'Medium',
			regionPlans: [{ regionName: 'US', latencyDescription: 'narrow' }, {
				regionName: 'Europe',
				latencyDescription: 'narrow',
			}],
			otherPlanIds: [],
		});
	});

	// The pickers show one plan; a shape carrying two is reported rather than silently reduced.
	it("shows only the first plan's regions and reports the other plan", () => {
		const result = prefill(shape([LEVEL_1.id, 'us-1'], [DEDICATED.id, 'us-ded']));
		expect(result?.regionPlans).toEqual([{ regionName: 'US', latencyDescription: 'narrow' }]);
		expect(result?.otherPlanIds).toEqual([DEDICATED.id]);
	});

	it('resolves a dedicated plan against the dedicated region list', () => {
		expect(prefill(shape([DEDICATED.id, 'us-ded']))).toMatchObject({
			deploymentDescription: 'Dedicated',
			performanceDescription: 'High',
			regionPlans: [{ regionName: 'US', latencyDescription: 'wide' }],
		});
	});

	it('gives a self-hosted plan no regions', () => {
		expect(prefill(shape([SELF_HOSTED.id, null]))).toEqual({
			deploymentDescription: 'Self-Hosted',
			performanceDescription: 'Standard',
			regionPlans: [],
			otherPlanIds: [],
		});
	});
});

describe('plansFromShape', () => {
	const instances = [
		{ fqdn: 'a.example.com', port: 9925, secure: 'true' as const },
		{ fqdn: 'b.example.com', port: 0, secure: 'false' as const },
	];

	// The claim must carry the shape's pairs exactly, so hosted rows go through untouched — including
	// a second plan the pickers could not show.
	it('sends hosted pairs verbatim', () => {
		expect(plansFromShape(shape([LEVEL_1.id, 'us-1'], [DEDICATED.id, 'us-ded']), instances, 9925)).toEqual([
			{ autoRenew: true, planId: LEVEL_1.id, regionId: 'us-1' },
			{ autoRenew: true, planId: DEDICATED.id, regionId: 'us-ded' },
		]);
	});

	it('gives every instance the self-hosted plan when the shape has no regions', () => {
		expect(plansFromShape(shape([SELF_HOSTED.id, null]), instances, 9925)).toEqual([
			{
				autoRenew: true,
				planId: SELF_HOSTED.id,
				instanceFqdn: 'a.example.com',
				operationsApiPort: 9925,
				operationsApiSecure: true,
			},
			{
				autoRenew: true,
				planId: SELF_HOSTED.id,
				instanceFqdn: 'b.example.com',
				operationsApiPort: 9925,
				operationsApiSecure: false,
			},
		]);
	});
});
