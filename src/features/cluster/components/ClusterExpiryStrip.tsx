import { describeGrantExpiry, HOBBYIST_UPGRADE, isUrgentExpiry } from '@/features/clusters/lib/grantExpiry';
import { Cluster } from '@/integrations/api/api.patch';
import { cn } from '@/lib/cn';
import { Link, useParams, useRouteContext } from '@tanstack/react-router';
import { useMemo } from 'react';

/**
 * The expiry warning, for the surface a customer actually works on.
 *
 * The cluster-settings banner is where the full story lives; a developer building against their
 * cluster may never open those pages before it stops. So this repeats the warning where they are —
 * but only from the last warning onward (`isUrgentExpiry`), and as a single line rather than a
 * block, because everything here sits above something they came to do.
 *
 * Renders nothing for a cluster with no grant, which is every self-hosted one.
 */
export function ClusterExpiryStrip() {
	const { organizationId, clusterId } = useParams({ strict: false }) as {
		organizationId?: string;
		clusterId?: string;
	};
	const { cluster } = useRouteContext({ strict: false }) as { cluster?: Cluster };
	const expiry = useMemo(() => (cluster ? describeGrantExpiry(cluster) : null), [cluster]);

	if (!isUrgentExpiry(expiry) || !expiry || !organizationId || !clusterId) { return null; }

	return (
		<div
			role="status"
			className={cn(
				'flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-4 py-1.5 text-sm md:px-12',
				expiry.severity === 'critical'
					? 'bg-red-50 text-destructive dark:bg-red-950/30'
					: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
			)}
		>
			<span className="font-medium">{expiry.title}</span>
			{expiry.offerUpgrade && (
				<Link
					to={`/${organizationId}/${clusterId}/edit`}
					search={{ upgrade: HOBBYIST_UPGRADE }}
					className="underline underline-offset-2 hover:no-underline"
				>
					Choose a plan
				</Link>
			)}
		</div>
	);
}
