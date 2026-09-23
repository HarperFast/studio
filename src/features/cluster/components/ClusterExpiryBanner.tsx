import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/buttonVariants';
import { describeGrantExpiry, HOBBYIST_UPGRADE } from '@/features/clusters/lib/grantExpiry';
import { Cluster } from '@/integrations/api/api.patch';
import { Link } from '@tanstack/react-router';
import { CircleAlertIcon, Loader2, TriangleAlertIcon } from 'lucide-react';
import { useMemo } from 'react';

/**
 * Says where a cluster sits in its plan's expiry timeline, and — once service has been withdrawn —
 * offers the only route back up. Renders nothing for a cluster with no grant or a healthy one.
 *
 * Lives in the cluster layout rather than the overview so a customer sees it from whichever page
 * they land on.
 */
export function ClusterExpiryBanner({
	cluster,
	canUpdate,
	onPlanPage = false,
}: {
	cluster?: Cluster;
	canUpdate: boolean;
	/** On the page the button opens, it would only link to where the reader already is. */
	onPlanPage?: boolean;
}) {
	const expiry = useMemo(() => (cluster ? describeGrantExpiry(cluster) : null), [cluster]);
	if (!expiry || !cluster) { return null; }
	const offerUpgrade = expiry.offerUpgrade && canUpdate && !onPlanPage;

	const Icon = expiry.stage === 'AWAITING_PLAN'
		? Loader2
		: expiry.severity === 'critical'
		? CircleAlertIcon
		: TriangleAlertIcon;

	return (
		<Alert
			variant={expiry.severity === 'critical' ? 'destructive' : expiry.severity === 'warning' ? 'warning' : 'default'}
			className="mb-4"
		>
			<Icon className={expiry.stage === 'AWAITING_PLAN' ? 'animate-spin' : undefined} />
			<AlertTitle>{expiry.title}</AlertTitle>
			{(expiry.detail || offerUpgrade) && (
				<AlertDescription>
					{expiry.detail && <p>{expiry.detail}</p>}
					{offerUpgrade && (
						<Link
							to={`/${cluster.organizationId}/${cluster.id}/edit`}
							search={{ upgrade: HOBBYIST_UPGRADE }}
							className={buttonVariants({ size: 'sm' })}
						>
							Choose a Plan
						</Link>
					)}
				</AlertDescription>
			)}
		</Alert>
	);
}
