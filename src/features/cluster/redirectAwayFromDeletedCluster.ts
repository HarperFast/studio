import { isDeletedCluster } from '@/config/clusterStatuses';
import { redirect } from '@tanstack/react-router';

/**
 * A bookmark to a page a terminated cluster's rail hides lands on the overview, not on a form central manager would
 * reject.
 */
export function redirectAwayFromDeletedCluster(
	{ context, params }: {
		context?: { cluster?: { status?: string; terminatedAt?: string } };
		params: { organizationId: string; clusterId: string };
	},
) {
	if (isDeletedCluster(context?.cluster)) {
		throw redirect({ to: `/${params.organizationId}/${params.clusterId}` });
	}
}
