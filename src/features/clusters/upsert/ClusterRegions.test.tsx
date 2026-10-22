/**
 * @vitest-environment jsdom
 */
import { Form } from '@/components/ui/form/Form';
import { OrganizationRegion } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { ClusterRegions } from './ClusterRegions';
import { buildRegionLookup } from './lib/regionLookup';
import { UpsertClusterSchemaType } from './upsertClusterSchema';

const orgRegion: OrganizationRegion = {
	id: 'oreg-1',
	organizationId: 'org-1',
	name: 'EU edge',
	placement: { gcp: ['europe-west1-b', 'europe-west4-a'] },
	fallbackGroup: null,
	active: true,
};

const range = { min: 0, max: 1 };

function Harness({ organizationRegions, canUseCustomRegions }: {
	organizationRegions: OrganizationRegion[];
	canUseCustomRegions: boolean;
}) {
	const form = useForm<UpsertClusterSchemaType>({
		defaultValues: {
			clusterName: 'c',
			abbreviatedName: '',
			deploymentDescription: 'Shared',
			performanceDescription: 'Basic',
			regionPlans: [{ regionId: '' }],
			instances: [],
		},
	});
	return (
		<Form {...form}>
			<ClusterRegions
				form={form}
				regionLocations={[]}
				regionLookup={buildRegionLookup([], organizationRegions, undefined)}
				regionNameToLatencyToRegion={{}}
				premiumOnlyRegions={{ regionNames: new Set(), regionIds: new Set() }}
				usageScale={{ readRate: range, totalReads: range, writeRate: range, totalWrites: range }}
				selectedPlan={undefined}
				totalPrice={10}
				isEnterprise={false}
				cloudProvider={undefined}
				organizationId="org-1"
				canUseCustomRegions={canUseCustomRegions}
				canDefineCustomRegions={false}
				lockedOrganizationRegionIds={[]}
			/>
		</Form>
	);
}

function renderRegions(props: Parameters<typeof Harness>[0]) {
	return render(
		<QueryClientProvider client={new QueryClient()}>
			<Harness {...props} />
		</QueryClientProvider>,
	);
}

describe('ClusterRegions with an empty catalog', () => {
	it('keeps the region rows when a custom region can be deployed instead', () => {
		renderRegions({ organizationRegions: [orgRegion], canUseCustomRegions: true });
		expect(screen.queryByText('No Regions Available')).toBeNull();
	});

	it('says no regions are available when no custom region can stand in', () => {
		renderRegions({ organizationRegions: [orgRegion], canUseCustomRegions: false });
		expect(screen.getByText('No Regions Available')).toBeTruthy();
	});
});
