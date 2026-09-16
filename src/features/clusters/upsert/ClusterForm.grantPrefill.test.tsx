/**
 * @vitest-environment jsdom
 *
 * The create form with an organization voucher: picking (or defaulting to) a comp with a shape must
 * fill deployment, performance and regions from that shape, not leave the catalogue defaults.
 */
import { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { ClusterGrant, Organization } from '@/integrations/api/api.patch';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClusterForm } from './ClusterForm';
import { UpsertClusterSchemaType } from './upsertClusterSchema';

vi.mock('@/features/clusters/hooks/useCreateNewCluster', () => ({
	useCreateNewClusterMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/clusters/hooks/useUpdateCluster', () => ({
	useEditClusterMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useAuth', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useStaffPermission: () => false,
}));

afterEach(cleanup);

const plan = (id: string, priceUsd: number, performance: string, deployment = 'Colocated'): SchemaPlan =>
	({
		id,
		priceUsd,
		planLevel: 0,
		performanceDescription: performance,
		deploymentDescription: deployment,
		deploymentType: deployment.toLowerCase(),
	}) as SchemaPlan;
const TRIAL = plan('fabric-block-trial', 0, '30-day trial (1K read/min)');
const HOBBYIST = plan('fabric-block-hobbyist', 20, 'Hobbyist (1K read/min)');
const LEVEL_1 = plan('fabric-block-level-1', 85, 'Medium (10K read/min)');
const PLANS = [TRIAL, HOBBYIST, LEVEL_1];
const CATALOGUE: Record<string, Record<string, SchemaPlan>> = {
	Colocated: Object.fromEntries(PLANS.map((p) => [p.performanceDescription!, p])),
};
const region = (id: string, name: string, latency: string): SchemaRegion =>
	({ id, region: name, latencyDescription: latency, instanceCount: 2 }) as SchemaRegion;
const REGIONS = [region('south-america-1', 'South America', 'narrow'), region('us-1', 'US', 'narrow')];

const comped = (id: string, regionId: string, planId = HOBBYIST.id): ClusterGrant =>
	({
		id,
		organizationId: 'org-1',
		source: 'comped',
		status: 'ACTIVE',
		isActive: true,
		shape: [{ planId, regionId }],
	}) as unknown as ClusterGrant;
const COMPED = comped('cgr-1', 'us-1');
const COMPED_SA = comped('cgr-2', 'south-america-1', LEVEL_1.id);

// What the create page hands the form for an org holding one voucher: the catalogue defaults for
// the pickers (the trial, first region) and the voucher pre-selected — index.tsx:241.
const defaults: UpsertClusterSchemaType = {
	clusterName: 'Test Cluster',
	abbreviatedName: 'test',
	version: '4.6.0',
	deploymentDescription: 'Colocated',
	performanceDescription: TRIAL.performanceDescription!,
	fqdn: '',
	instances: [],
	regionPlans: [{ regionName: 'South America', latencyDescription: 'narrow' }],
	grantId: COMPED.id,
} as UpsertClusterSchemaType;

async function mountCreate() {
	render(
		<TestProvider>
			<ClusterForm
				alreadyUsingFree={false}
				defaultValues={defaults}
				deploymentToPerformanceToPlan={CATALOGUE}
				harperVersions={{ value: [{ name: 'current', version: '4.6.0' }] } as never}
				mode={undefined}
				organization={{
					id: 'org-1',
					type: 'SELF_SERVICE',
					unboundGrants: [COMPED, COMPED_SA],
				} as unknown as Organization}
				organizationId="org-1"
				partialUpgrade={null}
				planTypes={PLANS}
				regionLocationsColocated={REGIONS}
				regionLocationsDedicated={[]}
				setSavedClusterState={() => {}}
				startOffOnBilling={false}
			/>
		</TestProvider>,
	);
	await act(() => null);
	await act(() => null);
}

/** The trigger inside the form item whose label matches, as ClusterDetails.test does. */
function selectFor(labelText: RegExp): HTMLElement {
	const label = screen.getAllByText(labelText).find((node) => node.closest('[data-slot="form-item"]'));
	const trigger = label?.closest('[data-slot="form-item"]')?.querySelector('[data-slot="select-trigger"]');
	if (!trigger) { throw new Error(`no select found for label ${String(labelText)}`); }
	return trigger as HTMLElement;
}

/** What the form would submit: Radix mirrors the value into a hidden native select. */
function nativeValue(name: string): string {
	return (document.querySelector(`select[name="${name}"]`) as HTMLSelectElement | null)?.value ?? '';
}

describe('ClusterForm — a shaped voucher fills the pickers', () => {
	it('shows the voucher plan and region, not the catalogue defaults', async () => {
		await mountCreate();
		expect(nativeValue('performanceDescription')).toBe(HOBBYIST.performanceDescription);
		expect(selectFor(/Performance/).textContent).not.toContain('30-day trial');
		expect(selectFor(/^Region/).textContent).toContain('US');
		expect(selectFor(/^Region/).textContent).not.toContain('South America');
	});

	it('follows a switch to another grant, and unlocks on None keeping the last shape', async () => {
		await mountCreate();
		await pick('Available grants', /cgr-2/);
		expect(nativeValue('performanceDescription')).toBe(LEVEL_1.performanceDescription);
		expect(selectFor(/^Region/).textContent).toContain('South America');

		await pick('Available grants', /cgr-1/);
		expect(nativeValue('performanceDescription')).toBe(HOBBYIST.performanceDescription);
		expect(selectFor(/^Region/).textContent).toContain('US');

		await pick('Available grants', /^None$/);
		expect(nativeValue('performanceDescription')).toBe(HOBBYIST.performanceDescription);
		expect(selectFor(/Performance/).getAttribute('data-disabled')).toBeNull();
	});
});

async function pick(labelText: string, option: RegExp) {
	fireEvent.keyDown(selectFor(new RegExp(labelText)), { key: 'ArrowDown' });
	await act(() => null);
	fireEvent.keyDown(screen.getByRole('option', { name: option }), { key: 'Enter' });
	await act(() => null);
	await act(() => null);
}
