import { useInstanceAuth } from '@/hooks/useAuth';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { Cluster } from '@/lib/api.patch';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';

export function ClusterCardAction({ cluster }: { cluster: Cluster }) {
	const auth = useInstanceAuth(cluster.id);
	const { view, update } = useOrganizationClusterPermissions(cluster.organizationId, cluster.id);
	const isPendingResetPassword = useMemo(() => cluster.resetPassword, [cluster]);
	if (!view) {
		return undefined;
	}

	if (!cluster.fqdn) {
		return <Link to={cluster.id} className="text-sm" aria-label={`View ${cluster.name}`} title={`View ${cluster.name}`}>
			<span className="py-2 hover:border-b-2">
				Instances <ArrowRight className="inline-block" />
			</span>
		</Link>;
	}

	if (isPendingResetPassword) {
		if (update) {
			return <Link to={`${cluster.id}/set-password`} className="text-sm" aria-label={`Set Password on ${cluster.name}`} title={`Set Password on ${cluster.name}`}>
				<span className="py-2 hover:border-b-2">
					Set Password <ArrowRight className="inline-block" />
				</span>
			</Link>;
		}
		return <span className="py-2">
			Pending Owner Setup
		</span>;
	}

	if (auth.isLoading) {
		return undefined;
	}
	if (auth.user) {
		return <Link to={`${cluster.id}/browse`} className="text-sm" aria-label={`View ${cluster.name}`} title={`View ${cluster.name}`}>
			<span className="py-2 hover:border-b-2">
				View <ArrowRight className="inline-block" />
			</span>
		</Link>;
	}
	return <Link to={`${cluster.id}/sign-in`} className="text-sm" aria-label={`Sign In to ${cluster.name}`} title={`Sign In to ${cluster.name}`}>
		<span className="py-2 hover:border-b-2">
			Sign In <ArrowRight className="inline-block" />
		</span>
	</Link>;
}
