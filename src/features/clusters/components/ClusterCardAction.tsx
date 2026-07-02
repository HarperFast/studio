import { Button } from '@/components/ui/button';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { Cluster } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

export function ClusterCardAction({ cluster, hasCardLink = false }: { cluster: Cluster; hasCardLink?: boolean }) {
	const { view, update } = useOrganizationClusterPermissions(cluster.organizationId, cluster.id);
	const base = `/${cluster.organizationId}/${cluster.id}`;

	if (!view) {
		return undefined;
	}

	// Self-hosted clusters open their own overview (see SelfHostedClusterHome), like managed clusters.
	if (clusterIsSelfManaged(cluster)) {
		return <OpenAction cluster={cluster} hasCardLink={hasCardLink} />;
	}

	// A managed cluster with no FQDN can't be connected to yet — send them to its instances.
	if (!cluster.fqdn) {
		if (hasCardLink) {
			return (
				<span className="text-sm text-nowrap py-2 ml-auto">
					Instances <ArrowRight className="inline-block" />
				</span>
			);
		}
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

	return <OpenAction cluster={cluster} hasCardLink={hasCardLink} />;
}

// Inside a card the whole card is the click target for opening the cluster (see ClusterCard's
// stretched link), so this is just a visual affordance. Standalone (Scaling, StartingUp) it links.
function OpenAction({ cluster, hasCardLink }: { cluster: Cluster; hasCardLink: boolean }) {
	if (hasCardLink) {
		return (
			<span className="text-sm text-nowrap py-2 ml-auto">
				Open <ArrowRight className="inline-block" />
			</span>
		);
	}
	return (
		<Link
			to={`/${cluster.organizationId}/${cluster.id}`}
			className="text-sm text-nowrap"
			aria-label={`Open ${cluster.name}`}
			title={`Open ${cluster.name}`}
		>
			<span className="py-2 hover:border-b-2">
				Open <ArrowRight className="inline-block" />
			</span>
		</Link>
	);
}
