/**
 * @vitest-environment jsdom
 *
 * A second submit while the first is still in flight must not send a second create: the server
 * admits both (#831). The button's isPending only disables it a tick after the click.
 */
import { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { ClusterGrant, Organization } from '@/integrations/api/api.patch';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClusterForm } from './ClusterForm';
import { UpsertClusterSchemaType } from './upsertClusterSchema';

// One shared spy that never settles, so the in-flight guard is what stands between two clicks.
const createCluster = vi.fn();
vi.mock('@/features/clusters/hooks/useCreateNewCluster', () => ({
	useCreateNewClusterMutation: () => ({ mutate: createCluster, isPending: false }),
}));
vi.mock('@/features/clusters/hooks/useUpdateCluster', () => ({
	useEditClusterMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useAuth', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useStaffPermission: () => false,
}));

afterEach(() => {
	cleanup();
	createCluster.mockClear();
});

const plan = (id: string, priceUsd: number, performance: string): SchemaPlan =>
	({
		id,
		priceUsd,
		planLevel: 0,
		performanceDescription: performance,
		deploymentDescription: 'Colocated',
		deploymentType: 'colocated',
	}) as SchemaPlan;
const HOBBYIST = plan('fabric-block-hobbyist', 20, 'Hobbyist (1K read/min)');
const REGIONS = [({ id: 'us-1', region: 'US', latencyDescription: 'narrow', instanceCount: 2 }) as SchemaRegion];
const COMPED = {
	id: 'cgr-1',
	organizationId: 'org-1',
	source: 'comped',
	status: 'ACTIVE',
	isActive: true,
	shape: [{ planId: HOBBYIST.id, regionId: 'us-1' }],
} as unknown as ClusterGrant;

const defaults = {
	clusterName: 'Test Cluster',
	abbreviatedName: 'test',
	version: '4.6.0',
	deploymentDescription: 'Colocated',
	performanceDescription: HOBBYIST.performanceDescription!,
	fqdn: '',
	instances: [],
	regionPlans: [{ regionName: 'US', latencyDescription: 'narrow' }],
	grantId: COMPED.id,
} as UpsertClusterSchemaType;

async function mountCreate() {
	render(
		<TestProvider>
			<ClusterForm
				alreadyUsingFree={false}
				defaultValues={defaults}
				deploymentToPerformanceToPlan={{ Colocated: { [HOBBYIST.performanceDescription!]: HOBBYIST } }}
				harperVersions={{ value: [{ name: 'current', version: '4.6.0' }] } as never}
				mode={undefined}
				organization={{ id: 'org-1', type: 'SELF_SERVICE', unboundGrants: [COMPED] } as unknown as Organization}
				organizationId="org-1"
				partialUpgrade={null}
				planTypes={[HOBBYIST]}
				regionLocationsColocated={REGIONS}
				regionLocationsDedicated={[]}
				setSavedClusterState={() => {}}
				startOffOnBilling={false}
			/>
		</TestProvider>,
	);
	await act(() => null);
	await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

describe('ClusterForm — one submit at a time', () => {
	it('a second click while the create is in flight sends nothing', async () => {
		await mountCreate();
		const button = screen.getByRole('button', { name: /Create New Cluster/ });
		fireEvent.click(button);
		fireEvent.click(button);
		await act(() => null);
		expect(createCluster).toHaveBeenCalledTimes(1);
	});
});
