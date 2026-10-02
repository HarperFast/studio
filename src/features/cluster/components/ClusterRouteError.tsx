import { ErrorComponent } from '@/components/ErrorComponent';
import { Button } from '@/components/ui/button';
import { PendingOwnerSetup } from '@/features/cluster/components/PendingOwnerSetup';
import { isForbiddenError } from '@/react-query/pollUnlessForbidden';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

/**
 * The cluster route loads the cluster before any page under it renders. Central manager answers 403 to members who
 * aren't org admins until a new cluster's setup is finished; its other per-cluster refusals read as 404.
 */
export function ClusterRouteError({ error }: { error: unknown }) {
	const { organizationId }: { organizationId?: string } = useParams({ strict: false });
	if (!isForbiddenError(error)) {
		return <ErrorComponent error={error} />;
	}
	return (
		<div className="flex flex-col items-center mt-24">
			<PendingOwnerSetup />
			{organizationId && (
				<Link to={`/${organizationId}`}>
					<Button variant="outline">
						<ArrowLeft /> Back to clusters
					</Button>
				</Link>
			)}
		</div>
	);
}
