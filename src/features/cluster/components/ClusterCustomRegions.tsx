import { getOrganizationRegionsQueryOptions } from '@/features/admin/organizationRegions/queries/getOrganizationRegions';
import {
	describeShape,
	isOrganizationRegionId,
	organizationRegionShape,
} from '@/features/clusters/upsert/lib/regionLookup';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { Cluster } from '@/integrations/api/api.patch';
import { pluralize } from '@/lib/pluralize';
import { useQuery } from '@tanstack/react-query';

// The instance count alone hides what a custom region deploys: how many units, of which datacenters.
export function ClusterCustomRegions({ cluster }: { cluster: Cluster }) {
	const customPlans = (cluster.plans ?? []).filter((plan) => isOrganizationRegionId(plan.regionId));
	const organizationId = customPlans.length ? cluster.organizationId : undefined;
	const { data: regions } = useQuery(getOrganizationRegionsQueryOptions(organizationId));
	const { data: organization } = useQuery({
		...getOrganizationQueryOptions(organizationId),
		enabled: !!organizationId,
	});
	if (!customPlans.length) {
		return null;
	}
	const provider = organization?.channel === 'Akamai' ? 'linode' : 'gcp';
	const regionsById = new Map((regions ?? []).map((region) => [region.id, region]));
	return (
		<ul aria-label="Custom regions" className="mt-1 space-y-0.5 text-sm text-muted-foreground">
			{customPlans.map((plan) => {
				const region = regionsById.get(plan.regionId!);
				const units = plan.quantity ?? 1;
				const shape = region ? describeShape(organizationRegionShape(region, provider)) : '';
				return (
					<li key={plan.regionId}>
						<span className="text-foreground">{region?.name ?? plan.region ?? plan.regionId}</span>
						{' · '}
						{pluralize(units, 'unit', 'units')}
						{shape && <span className="font-mono text-xs">{` of ${shape}`}</span>}
					</li>
				);
			})}
		</ul>
	);
}
