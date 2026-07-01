import { SubNavItem, SubNavRail } from '@/components/SubNavRail';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { GaugeIcon, GlobeIcon, LayoutDashboardIcon, ServerIcon, TagIcon } from 'lucide-react';
import { ReactNode } from 'react';

/**
 * Shared shell for the cluster-scoped pages (overview/home, instances, scaling, domains). Renders the
 * same responsive sub-nav rail as the org page so those sections persist across them. The in-cluster
 * studio (apps, databases, …) keeps its own top nav — this rail is the cluster-settings level. Items
 * are gated by cluster permissions (scaling/domains require manage; domains also hides for self-managed).
 */
export function ClusterPageLayout({ children }: { children: ReactNode }) {
	const { organizationId, clusterId } = useParams({ strict: false }) as {
		organizationId?: string;
		clusterId?: string;
	};
	const { view, update } = useOrganizationClusterPermissions(organizationId, clusterId);
	const { data: cluster } = useQuery(getClusterInfoQueryOptions(clusterId, false));
	const selfManaged = cluster ? clusterIsSelfManaged(cluster) : false;
	const base = `/${organizationId}/${clusterId}`;

	const items = [
		{ to: base, label: 'Overview', icon: LayoutDashboardIcon, exact: true },
		// Scaling and Version open the cluster editor (matching the card's "Edit Scaling" / "Edit
		// Version"), not the /scaling update-progress screen. Both are exact so /edit/version doesn't
		// also light up Scaling (/edit).
		update && { to: `${base}/edit`, label: 'Scaling', icon: GaugeIcon, exact: true },
		update && !selfManaged && { to: `${base}/edit/version`, label: 'Version', icon: TagIcon, exact: true },
		update && !selfManaged && { to: `${base}/domains`, label: 'Domains', icon: GlobeIcon },
		view && { to: `${base}/instances`, label: 'Instances', icon: ServerIcon },
	].filter(Boolean) as SubNavItem[];

	return (
		<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-(--spacing(32)))]">
			<div className="md:grid gap-6 md:grid-cols-12">
				<aside className="md:col-span-3 lg:col-span-2 mb-4 md:mb-0">
					<SubNavRail items={items} ariaLabel="Cluster sections" />
				</aside>
				<section className="md:col-span-9 lg:col-span-10 min-w-0">{children}</section>
			</div>
		</div>
	);
}
