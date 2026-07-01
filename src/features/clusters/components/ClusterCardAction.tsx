import { Button } from '@/components/ui/button';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { Cluster } from '@/integrations/api/api.patch';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

export function ClusterCardAction({ cluster }: { cluster: Cluster }) {
	const { view, update } = useOrganizationClusterPermissions(cluster.organizationId, cluster.id);
	const base = `/${cluster.organizationId}/${cluster.id}`;

	if (!view) {
		return undefined;
	}

	// A cluster with no FQDN can't be connected to yet — send them to its instances.
	if (!cluster.fqdn) {
		return (
			<Link
				to={`${base}/instances`}
				className="text-sm text-nowrap"
				aria-label={`View ${cluster.name}`}
				title={`View ${cluster.name}`}
			>
				<span className="py-2 hover:border-b-2">
					Instances <ArrowRight className="inline-block" />
				</span>
			</Link>
		);
	}

	if (cluster.resetPassword) {
		if (update) {
			return (
				<Link
					to={`${base}/finish-setup`}
					className="text-sm text-nowrap"
					aria-label={`Set Password on ${cluster.name}`}
					title={`Set Password on ${cluster.name}`}
				>
					<Button variant="positive" className="py-2 hover:border-b-2 animate-glow-pulse">
						Finish Setup <ArrowRight className="inline-block" />
					</Button>
				</Link>
			);
		}
		return (
			<span className="py-2 text-nowrap">
				Pending Owner Setup
			</span>
		);
	}

	// The whole card is the click target for opening the cluster (see ClusterCard's stretched link),
	// so this is just a visual affordance — not its own link.
	return (
		<span className="text-sm text-nowrap py-2 ml-auto">
			Open <ArrowRight className="inline-block" />
		</span>
	);
}
