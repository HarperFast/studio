import { Loading } from '@/components/Loading';
import { ConfigNavigation } from '@/features/instance/config/ConfigNavigation';
import { useConfigNavigation } from '@/features/instance/config/useConfigNavigation';
import { useStudioConfiguration } from '@/features/instance/extensions/useStudioExtensions';
import { useLoadedInstanceVersion } from '@/features/instance/useLoadedInstanceVersion';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { Navigate, Outlet, useLocation, useParams } from '@tanstack/react-router';
import { Suspense, useMemo } from 'react';
import './config-navigation.css';

export function ConfigIndex() {
	const version = useLoadedInstanceVersion();
	return version === undefined
		? <Loading className="flex flex-col items-center justify-center py-24" text="Loading..." />
		: <ConfigShell version={version} />;
}

function ConfigShell({ version }: { version: string }) {
	const params: { clusterId?: string; instanceId?: string; organizationId?: string } = useParams({ strict: false });
	const { pathname } = useLocation();
	const { groups, configPath, canManage, canListDeployments } = useConfigNavigation(version);
	const { isPending: extensionEntriesPending } = useStudioConfiguration();

	const atIndex = pathname.replace(/\/+$/, '') === configPath;
	const entryPaths = groups.flatMap(({ entries }) => entries.map(({ to }) => to));
	const onEntry = entryPaths.some((to) => isAtOrUnder(pathname, to));
	const redirectTo = !canManage && !onEntry ? entryPaths[0] ?? buildAbsoluteLinkToPage(params, 'databases') : undefined;
	// Navigate navigates again whenever its props change, and `pathname` re-renders this page while that navigation is
	// still pending, so a fresh element each render would restart it forever.
	const redirect = useMemo(() => redirectTo && <Navigate to={redirectTo} replace />, [redirectTo]);

	if (!canManage && (canListDeployments === undefined || extensionEntriesPending)) {
		return <Loading centered text="Loading..." />;
	}
	if (redirect) {
		return redirect;
	}

	return (
		<div className="config-shell">
			<div className="config-layout" data-has-navigation={groups.length > 0}>
				{groups.length > 0 && <ConfigNavigation groups={groups} atIndex={atIndex} />}
				<div className="min-w-0">
					<Suspense
						fallback={<Loading className="flex flex-col items-center justify-center h-full" text="Loading..." />}
					>
						<Outlet />
					</Suspense>
				</div>
			</div>
		</div>
	);
}

function isAtOrUnder(pathname: string, path: string): boolean {
	const at = pathname.replace(/\/+$/, '');
	const base = path.replace(/\/+$/, '');
	return at === base || at.startsWith(`${base}/`);
}
