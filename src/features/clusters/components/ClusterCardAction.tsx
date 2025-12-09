import { Button } from '@/components/ui/button';
import { defaultInstanceRoute } from '@/config/constants';
import { authStore } from '@/features/auth/store/authStore';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { Cluster } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

export function ClusterCardAction({ cluster }: { cluster: Cluster }) {
	const auth = useInstanceAuth(cluster.id);
	const { view, update } = useOrganizationClusterPermissions(cluster.organizationId, cluster.id);
	const isFabricConnect = authStore.checkForFabricConnect(cluster.id);
	const isDirectConnect = !isFabricConnect && !!auth.user;

	if (!view) {
		return undefined;
	}

	if (!cluster.fqdn) {
		return (
			<Link
				to={`/${cluster.organizationId}/${cluster.id}/instances`}
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
					to={`/${cluster.organizationId}/${cluster.id}/finish-setup`}
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

	if (auth.isLoading) {
		return undefined;
	}

	if (isDirectConnect) {
		return (
			<Link
				to={`/${cluster.organizationId}/${cluster.id}${defaultInstanceRoute}`}
				className="text-sm text-nowrap"
				aria-label={`View ${cluster.name}`}
				title={`View ${cluster.name}`}
			>
				<span className="py-2 hover:border-b-2">
					Direct Connect <ArrowRight className="inline-block" />
				</span>
			</Link>
		);
	}

	if (update && !clusterIsSelfManaged(cluster)) {
		return (
			<Link
				to={`/${cluster.organizationId}/${cluster.id}${defaultInstanceRoute}`}
				className="text-sm text-nowrap"
				aria-label={`Connect to ${cluster.name}`}
				title={`Connect to ${cluster.name}`}
			>
				<span className="py-2 hover:border-b-2">
					Fabric Connect <ArrowRight className="inline-block" />
				</span>
			</Link>
		);
	}

	return (
		<Link
			to={`/${cluster.organizationId}/${cluster.id}/sign-in`}
			className="text-sm text-nowrap"
			aria-label={`Sign In to ${cluster.name}`}
			title={`Sign In to ${cluster.name}`}
		>
			<span className="py-2 hover:border-b-2">
				Direct Sign In <ArrowRight className="inline-block" />
			</span>
		</Link>
	);
}
