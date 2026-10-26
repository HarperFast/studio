/**
 * @vitest-environment jsdom
 */
import { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { Cluster, Organization } from '@/integrations/api/api.patch';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({
	params: {} as { organizationId: string; clusterId?: string },
	context: {} as { organization: Organization; cluster?: Cluster },
}));
vi.mock('@tanstack/react-router', () => ({
	useParams: () => route.params,
	useRouteContext: () => route.context,
	useSearch: () => ({}),
}));
vi.mock('@/hooks/useAuth', () => ({ useStaffPermission: () => true }));
vi.mock('@/hooks/usePermissions', () => ({
	useOrganizationClusterPermissions: () => ({ create: true, update: true }),
}));
vi.mock('@/components/SubNavMenu', () => ({ SubNavMenu: () => null }));
vi.mock(
	'@/components/SubNavSimpleLayout',
	() => ({ SubNavSimpleLayout: ({ children }: { children: ReactNode }) => children }),
);
vi.mock('@/features/cluster/components/ClusterPageLayout', () => ({
	ClusterPageLayout: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/ContactUs', () => ({ ContactUs: () => 'contact us' }));
vi.mock('@/components/ErrorComponent', () => ({ ErrorComponent: ({ title }: { title: string }) => <h2>{title}</h2> }));
vi.mock('./ClusterForm', () => ({
	ClusterForm: ({ defaultValues, startOffOnBilling }: {
		defaultValues: { regionPlans: unknown };
		startOffOnBilling: boolean;
	}) => <output data-billing={startOffOnBilling}>{JSON.stringify(defaultValues.regionPlans)}</output>,
}));
vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }));

const colocatedPlan = { id: 'plan-colo', deploymentType: 'colocated', deploymentDescription: 'Shared' } as SchemaPlan;
const dedicatedPlan = { id: 'plan-ded', deploymentType: 'dedicated', deploymentDescription: 'Dedicated' } as SchemaPlan;
const usColocated = { id: 'us-1', region: 'US', latencyDescription: 'Low', instanceCount: 2 } as SchemaRegion;
const euDedicated = { id: 'eu-ded', region: 'EU', latencyDescription: 'Low', instanceCount: 2 } as SchemaRegion;

const answer = (key: string, data: unknown) => ({ queryKey: [key], queryFn: async () => data });
vi.mock('@/features/cluster/queries/getPlanTypesQuery', () => ({
	getPlanTypesOptions: () => answer('plans', [colocatedPlan, dedicatedPlan]),
}));
vi.mock('@/features/clusters/queries/getRegionLocationsQuery', () => ({
	getRegionLocationsOptions: ({ availableHosts }: { availableHosts?: boolean }) =>
		answer(`regions-${availableHosts}`, availableHosts ? [usColocated] : [usColocated, euDedicated]),
}));
vi.mock('@/features/clusters/queries/getHarperVersionsQuery', () => ({
	getHarperVersionsOptions: () => answer('versions', { value: [{ name: 'current', version: '5.3.2' }] }),
}));
vi.mock('@/features/admin/organizationRegions/queries/getOrganizationRegions', () => ({
	getOrganizationRegionsQueryOptions: () => answer('organizationRegions', []),
}));

import { toast } from 'sonner';
import { UpsertCluster } from './index';

const organization = { id: 'org-1', clusters: [] } as unknown as Organization;
const dedicatedCluster = {
	id: 'clu-1',
	name: 'ded',
	status: 'FAILED',
	plans: [{ regionId: 'eu-ded', planId: 'plan-ded' }],
	instances: [],
} as unknown as Cluster;

function renderUpsert() {
	return render(
		<QueryClientProvider client={new QueryClient()}>
			<UpsertCluster />
		</QueryClientProvider>,
	);
}

afterEach(() => localStorage.clear());

describe('UpsertCluster', () => {
	it('retries a failed dedicated cluster from the dedicated catalog, where its regions are', async () => {
		route.params = { organizationId: 'org-1' };
		route.context = { organization };
		localStorage.setItem(LocalStorageKeys.SavedClusterState, JSON.stringify(dedicatedCluster));
		renderUpsert();

		expect((await screen.findByRole('status')).textContent).toBe('[{"regionId":"eu-ded"}]');
	});

	it('still refuses to edit a cluster with a region it cannot resolve', async () => {
		route.params = { organizationId: 'org-1', clusterId: 'clu-1' };
		route.context = {
			organization,
			cluster: { ...dedicatedCluster, plans: [{ regionId: 'gone', planId: 'plan-ded' }] } as unknown as Cluster,
		};
		renderUpsert();

		expect(await screen.findByText('Region Unavailable')).toBeTruthy();
	});

	it('opens a cluster from the server when a legacy draft no longer matches the catalog', async () => {
		route.params = { organizationId: 'org-1', clusterId: 'clu-1' };
		route.context = { organization, cluster: { ...dedicatedCluster, status: 'RUNNING' } as unknown as Cluster };
		localStorage.setItem(
			LocalStorageKeys.SavedClusterState,
			JSON.stringify({
				clusterName: 'ded',
				skipToBilling: true,
				regionPlans: [{ regionName: 'EU', latencyDescription: 'Lowest' }],
			}),
		);
		renderUpsert();

		const form = await screen.findByRole('status');
		expect(form.textContent).toBe('[{"regionId":"eu-ded"}]');
		expect(form.getAttribute('data-billing')).toBe('false');
		expect(toast.warning).toHaveBeenCalledWith(
			'Your saved cluster changes could not be restored. Please make them again.',
		);
	});
});
