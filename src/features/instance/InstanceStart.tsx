import { Loading } from '@/components/Loading';
import { extensionPagePath } from '@/features/instance/extensions/extensionPagePath';
import { useStudioConfiguration, useVisibleExtensionPages } from '@/features/instance/extensions/useStudioExtensions';
import { useInstanceNavLinks } from '@/features/instance/useInstanceNavLinks';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { Link, Navigate, useParams } from '@tanstack/react-router';
import { EyeOffIcon } from 'lucide-react';

/**
 * Where "Enter cluster" lands: the cluster's configured landing page when this viewer can open it, else
 * the first tab the nav shows them, or why there is none. Waits for the role and the cluster's
 * configuration, so a focused cluster never flashes Applications first.
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
		return <Navigate to={buildAbsoluteLinkToPage(params, extensionPagePath(configPage))} replace />;
	}
	return reachable[0] ? <Navigate to={reachable[0].to} replace /> : <NothingToOpen params={params} />;
}

// Every role may open Databases, so the navigation hides that and everything else this viewer can see. A super
// user is the one who can undo it, and hiding restricts nothing, so the tabs still open for them from a link;
// anyone else needs someone who can change the cluster's configuration or their role.
function NothingToOpen({ params }: { params: { organizationId?: string; instanceId?: string; clusterId?: string } }) {
	const canManage = useInstanceManagePermission();
	return (
		<div className="text-center py-12 px-4">
			<EyeOffIcon className="size-12 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
			<h1 className="text-xl font-medium mb-2 text-foreground">Nothing to open here</h1>
			<p className="text-sm text-muted-foreground max-w-md mx-auto">
				{canManage
					? (
						<>
							This cluster's navigation hides every tab. Hiding doesn't restrict anything, so each still opens from a
							link, such as <Link to={buildAbsoluteLinkToPage(params, 'config')} className="underline">Config</Link> or
							{' '}
							<Link to={buildAbsoluteLinkToPage(params, 'operations')} className="underline">Operations</Link>.
						</>
					)
					: "This cluster's navigation hides every page your role can open. Ask an administrator to show one, or to give your role access to another."}
			</p>
		</div>
	);
}
