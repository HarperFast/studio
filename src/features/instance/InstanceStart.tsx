import { Loading } from '@/components/Loading';
import { useStudioConfiguration, useVisibleExtensionPages } from '@/features/instance/extensions/useStudioExtensions';
import { useInstanceNavLinks } from '@/features/instance/useInstanceNavLinks';
import { useInstanceAuth } from '@/hooks/useAuth';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { Navigate, useParams } from '@tanstack/react-router';

/**
 * Where "Enter cluster" lands: the cluster's configured landing page when this viewer can open it, else
 * the first tab the nav shows them. Waits for the role and the cluster's configuration, so a
 * focused cluster never flashes Applications first.
 */
export function InstanceStart() {
	const params: { organizationId?: string; instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const { user } = useInstanceAuth(params.instanceId ?? params.clusterId);
	const { configuration, isPending } = useStudioConfiguration();
	const { links, tucked } = useInstanceNavLinks();
	const configPages = useVisibleExtensionPages('config');

	if (!user || isPending) {
		return <Loading className="flex flex-col items-center justify-center py-24" text="Opening…" />;
	}
	// Only a tab the nav offers: a hidden landing would loop back here through the index it hides.
	const reachable = [...links, ...tucked];
	const tab = reachable.find((link) => link.key === configuration.landing);
	if (tab) {
		return <Navigate to={tab.to} replace />;
	}
	// A page inside Config has a route of its own, so it never passes back through the index.
	const configPage = configPages.find((page) => page.key === configuration.landing);
	if (configPage) {
		return <Navigate to={buildAbsoluteLinkToPage(params, `config/ext/${configPage.key}`)} replace />;
	}
	return reachable[0] ? <Navigate to={reachable[0].to} replace /> : null;
}
