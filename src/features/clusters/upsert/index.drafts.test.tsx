/** @vitest-environment jsdom */
import type { Cluster } from '@/integrations/api/api.patch';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpsertCluster } from './index';

const state = vi.hoisted(() => ({
	params: { organizationId: 'org-a' } as { organizationId: string; clusterId?: string },
	cluster: undefined as Cluster | undefined,
	saved: null as unknown,
}));
vi.mock('@tanstack/react-router', () => ({
	useSearch: () => ({}),
	useParams: () => state.params,
	useRouteContext: () => ({ organization: { id: 'org-a', clusters: [] }, cluster: state.cluster }),
}));
vi.mock('@tanstack/react-query', () => ({
	useQuery: ({ queryKey }: { queryKey: string[] }) => ({
		data: {
			plans: [{ id: 'shared', priceUsd: 10, deploymentDescription: 'Shared', performanceDescription: 'Basic' }],
			// The edit route's cluster runs in reg-east; a region the form can't resolve refuses the edit.
			regions: [{ id: 'reg-east', region: 'US East', latencyDescription: '90ms', instanceCount: 2 }],
			organizationRegions: [],
			versions: { value: [{ name: 'current', version: '5.0.0' }] },
		}[queryKey[0]],
	}),
}));
vi.mock(
	'@/features/cluster/queries/getPlanTypesQuery',
	() => ({ getPlanTypesOptions: () => ({ queryKey: ['plans'] }) }),
);
vi.mock(
	'@/features/clusters/queries/getRegionLocationsQuery',
	() => ({ getRegionLocationsOptions: () => ({ queryKey: ['regions'] }) }),
);
vi.mock(
	'@/features/admin/organizationRegions/queries/getOrganizationRegions',
	() => ({ getOrganizationRegionsQueryOptions: () => ({ queryKey: ['organizationRegions'] }) }),
);
vi.mock('@/hooks/useAuth', () => ({ useStaffPermission: () => false }));
vi.mock(
	'@/features/clusters/queries/getHarperVersionsQuery',
	() => ({ getHarperVersionsOptions: () => ({ queryKey: ['versions'] }) }),
);
vi.mock('@/hooks/useLocalStorage', () => ({
	useLocalStorage: () => [state.saved, (next: unknown) => {
		state.saved = typeof next === 'function' ? next(state.saved) : next;
	}],
}));
vi.mock(
	'@/hooks/usePermissions',
	() => ({ useOrganizationClusterPermissions: () => ({ create: true, update: true }) }),
);
vi.mock('@/components/SubNavMenu', () => ({ SubNavMenu: () => null }));
vi.mock(
	'@/components/SubNavSimpleLayout',
	() => ({ SubNavSimpleLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }),
);
vi.mock(
	'@/features/cluster/components/ClusterPageLayout',
	() => ({ ClusterPageLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }),
);
// Clears the draft on mount like the real form, and replays the billing step's save-then-clear from
// the setter it was first handed.
vi.mock('./ClusterForm', async () => {
	const { useEffect } = await import('react');
	return {
		ClusterForm: ({ defaultValues, startOffOnBilling, setSavedClusterState }: {
			defaultValues: { clusterName: string };
			startOffOnBilling: boolean;
			setSavedClusterState: (value: unknown) => void;
		}) => {
			useEffect(() => setSavedClusterState(null), [setSavedClusterState]);
			return (
				<>
					<p>{`form for "${defaultValues.clusterName}"${startOffOnBilling ? ', on billing' : ''}`}</p>
					<button
						type="button"
						onClick={() => {
							setSavedClusterState({ clusterId: state.params.clusterId, clusterName: 'Mid-redirect' });
							setSavedClusterState(null);
						}}
					>
						Billing redirect fails
					</button>
				</>
			);
		},
	};
});

afterEach(() => {
	cleanup();
	state.params = { organizationId: 'org-a' };
	state.cluster = undefined;
	state.saved = null;
});

const editDraft = {
	clusterId: 'clu-1',
	clusterName: 'Production, resized',
	deploymentDescription: 'Shared',
	performanceDescription: 'Basic',
	regionPlans: [],
	instances: [],
	skipToBilling: true,
};

function onEditRoute(id: string, name: string) {
	state.params = { organizationId: 'org-a', clusterId: id };
	state.cluster = { id, name, organizationId: 'org-a', plans: [{ planId: 'shared', regionId: 'reg-east' }] };
}

describe('UpsertCluster — a saved cluster draft', () => {
	it('reopens an edit draft on the edit form of the cluster it was saved from, then clears it', () => {
		onEditRoute('clu-1', 'Production');
		state.saved = editDraft;
		render(<UpsertCluster />);
		expect(screen.getByText('form for "Production, resized", on billing')).toBeTruthy();
		expect(state.saved).toBeNull();
	});

	it('neither fills nor clears a new-cluster form with an edit draft (#1852)', () => {
		state.saved = editDraft;
		render(<UpsertCluster />);
		expect(screen.getByText('form for ""')).toBeTruthy();
		expect(state.saved).toBe(editDraft);
	});

	it("neither fills nor clears another cluster's edit form with an edit draft", () => {
		onEditRoute('clu-2', 'Staging');
		state.saved = editDraft;
		render(<UpsertCluster />);
		expect(screen.getByText('form for "Staging"')).toBeTruthy();
		expect(state.saved).toBe(editDraft);
	});

	it('still reopens a new-cluster draft on the new-cluster form, then clears it', () => {
		state.saved = { ...editDraft, clusterId: undefined, clusterName: 'Fresh' };
		render(<UpsertCluster />);
		expect(screen.getByText('form for "Fresh", on billing')).toBeTruthy();
		expect(state.saved).toBeNull();
	});

	it('still prefills a new-cluster form from a failed cluster being tried again, then clears it', () => {
		state.saved = { id: 'clu-9', name: 'Failed one', organizationId: 'org-a', plans: [] };
		render(<UpsertCluster />);
		expect(screen.getByText('form for "Failed one"')).toBeTruthy();
		expect(state.saved).toBeNull();
	});

	it('clears the draft the billing step saved when its redirect fails, though it rendered before the save', () => {
		onEditRoute('clu-1', 'Production');
		render(<UpsertCluster />);
		fireEvent.click(screen.getByRole('button', { name: 'Billing redirect fails' }));
		expect(state.saved).toBeNull();
	});
});
