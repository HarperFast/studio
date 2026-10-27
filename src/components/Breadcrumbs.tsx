import { breadcrumbTrail } from '@/components/breadcrumbTrail';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isLocalStudio } from '@/config/constants';
import { useExtensionPageName } from '@/features/instance/extensions/useStudioExtensions';
import { Cluster, Instance, Organization } from '@/integrations/api/api.patch';
import { Link, useLocation, useMatches, useRouteContext } from '@tanstack/react-router';
import { HomeIcon } from 'lucide-react';
import { useMemo } from 'react';

export function Breadcrumbs({ restartRequired }: { restartRequired?: boolean }) {
	const location = useLocation();

	const { organization, instance, cluster }: {
		organization?: Organization;
		instance?: Instance;
		cluster?: Cluster;
	} = useRouteContext({ strict: false });
	const targetNoun = (instance || isLocalStudio) ? 'Instance' : 'Cluster';

	// The leaf match's own pathname, not `useLocation`'s, so the route template and the path it is read against always
	// belong to the same navigation.
	const leaf = useMatches({ select: (matches) => matches[matches.length - 1] });
	const pathname = leaf?.pathname ?? location.pathname;
	const routePath: string | undefined = leaf?.fullPath;
	const params = leaf?.params as Record<string, unknown> | undefined;
	const extensionName = useExtensionPageName(params?.extensionKey);

	const breadcrumbs = useMemo(() => {
		const breadcrumbs = [
			<Link key="home" to="/">
				<HomeIcon aria-hidden="true" className="size-5 shrink-0" />
				<span className="sr-only">Home</span>
			</Link>,
		];

		const trail = breadcrumbTrail(pathname, routePath, params ?? {}, {
			organization: organization?.name,
			cluster: cluster?.name,
			instance: instance?.name,
			extension: extensionName,
		});
		for (const { path, label, title } of trail) {
			breadcrumbs.push(
				<svg
					key={breadcrumbs.length + '-dash'}
					fill="currentColor"
					viewBox="0 0 20 20"
					aria-hidden="true"
					className="size-5 shrink-0 text-grey"
				>
					<path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
				</svg>,
				<Link
					key={path}
					to={path}
					title={title}
					className="text-xs md:text-sm font-medium hover:text-grey truncate max-w-48"
				>
					{label}
				</Link>,
			);
		}

		return breadcrumbs;
	}, [pathname, routePath, params, cluster?.name, instance?.name, organization?.name, extensionName]);

	return (
		<div role="list" className="flex items-center space-x-2 xl:space-x-4 sm:max-w-9/10 max-w-[calc(100%-56px)]">
			{...breadcrumbs}
			{restartRequired && (
				<Tooltip>
					<TooltipTrigger asChild>
						<div className="text-xs italic text-muted-foreground">
							* Restart <span className="hidden lg:inline-block">Requested</span>
						</div>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						This {targetNoun} is requesting a restart, when convenient, to apply your latest changes.
						<br />You can do this from the Apps or Config pages.
					</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
}
