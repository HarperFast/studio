import { Cluster, SchemaOrganizationDomain } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';

export function canBindDomain(domain: SchemaOrganizationDomain, cluster: Cluster): boolean {
	return domain.status === 'ACTIVE' && !domain.clusterId && !clusterIsSelfManaged(cluster);
}

/** The ticked ids the list still offers for binding, in the order they were ticked. */
export function bindableDomainIds(
	selectedDomainIds: string[],
	domains: SchemaOrganizationDomain[] | undefined,
	cluster: Cluster,
): string[] {
	return selectedDomainIds.filter((id) =>
		domains?.some((domain) => domain.id === id && canBindDomain(domain, cluster))
	);
}
