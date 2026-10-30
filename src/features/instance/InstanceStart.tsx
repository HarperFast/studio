import { Loading } from '@/components/Loading';
import { useStudioConfiguration } from '@/features/instance/extensions/useStudioExtensions';
import { useInstanceNavLinks } from '@/features/instance/useInstanceNavLinks';
import { useInstanceAuth } from '@/hooks/useAuth';
import { Navigate, useParams } from '@tanstack/react-router';

/**
 * Where "Enter cluster" lands: the cluster's configured landing page when this viewer can open it, else
 * the first tab the nav shows them. Waits for the role and the cluster's configuration, so a
 * focused cluster never flashes Applications first.
 */
export function InstanceStart() {
	const { clusterId, instanceId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const { user } = useInstanceAuth(instanceId ?? clusterId);
	const { configuration, isPending } = useStudioConfiguration();
	const { links, tucked } = useInstanceNavLinks();

	if (!user || isPending) {
		return <Loading className="flex flex-col items-center justify-center py-24" text="Opening…" />;
	}
	// Only a tab the nav offers: a hidden landing would loop back here through the index it hides.
	const reachable = [...links, ...tucked];
	const target = reachable.find((link) => link.key === configuration.landing) ?? reachable[0];
	return target ? <Navigate to={target.to} replace /> : null;
}
