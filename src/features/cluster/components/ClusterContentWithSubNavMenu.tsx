import { SubNavMenu } from '@/components/SubNavMenu';
import { ClusterPageLayout } from '@/features/cluster/components/ClusterPageLayout';
import { ReactNode } from 'react';

/**
 * Cluster equivalent of NestedContentWithSubNavMenu: breadcrumb bar + the cluster sub-nav rail
 * (ClusterPageLayout) wrapping the page content. Used by the cluster-scoped pages that render inside
 * the rail (scaling, domains). StartingUp intentionally keeps the plain NestedContentWithSubNavMenu —
 * it's a pre-provisioning wait screen with nothing to manage yet.
 */
export function ClusterContentWithSubNavMenu({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<>
			<SubNavMenu />
			<ClusterPageLayout>
				<div className={className}>{children}</div>
			</ClusterPageLayout>
		</>
	);
}
