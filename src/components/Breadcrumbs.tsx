import { type Breadcrumb, breadcrumbTrail } from '@/components/breadcrumbTrail';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdownMenu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isLocalStudio } from '@/config/constants';
import { useExtensionPageName } from '@/features/instance/extensions/useStudioExtensions';
import { Cluster, Instance, Organization } from '@/integrations/api/api.patch';
import { cn } from '@/lib/cn';
import { Link, useLocation, useMatches, useRouteContext } from '@tanstack/react-router';
import { EllipsisIcon, HomeIcon } from 'lucide-react';
import { Fragment, useMemo } from 'react';

interface RouteNames {
	organization?: Organization;
	instance?: Instance;
	cluster?: Cluster;
}

/** The crumbs after Home for the page the router is on. */
export function useBreadcrumbTrail(): Breadcrumb[] {
	const location = useLocation();
	const { organization, instance, cluster }: RouteNames = useRouteContext({ strict: false });

	// The leaf match's own pathname, not `useLocation`'s, so the route template and the path it is read against always
	// belong to the same navigation.
	const leaf = useMatches({ select: (matches) => matches[matches.length - 1] });
	const pathname = leaf?.pathname ?? location.pathname;
	const routePath: string | undefined = leaf?.fullPath;
	const params = leaf?.params as Record<string, unknown> | undefined;
	const extensionName = useExtensionPageName(params?.extensionKey);

	return useMemo(() =>
		breadcrumbTrail(pathname, routePath, params ?? {}, {
			organization: organization?.name,
			cluster: cluster?.name,
			instance: instance?.name,
			extension: extensionName,
		}), [pathname, routePath, params, cluster?.name, instance?.name, organization?.name, extensionName]);
}

/**
 * Home and the trail to the current page. `collapse` folds that many leading crumbs into a menu behind "…" for a bar
 * short of room; the last crumb always shows.
 */
export function Breadcrumbs({ restartRequired, collapse = 0, className }: {
	restartRequired?: boolean;
	collapse?: number;
	className?: string;
}) {
	const { instance }: RouteNames = useRouteContext({ strict: false });
	const targetNoun = (instance || isLocalStudio) ? 'Instance' : 'Cluster';
	const trail = useBreadcrumbTrail();
	const folded = trail.slice(0, Math.min(collapse, trail.length - 1));
	const shown = trail.slice(folded.length);

	return (
		<div
			role="list"
			className={cn('flex items-center space-x-2 xl:space-x-4 sm:max-w-9/10 max-w-[calc(100%-56px)]', className)}
		>
			<Link to="/" className="shrink-0">
				<HomeIcon aria-hidden="true" className="size-5 shrink-0" />
				<span className="sr-only">Home</span>
			</Link>
			{folded.length > 0 && (
				<>
					<CrumbSeparator />
					<FoldedCrumbs crumbs={folded} />
				</>
			)}
			{shown.map(({ path, label, title }) => (
				<Fragment key={path}>
					<CrumbSeparator />
					<Link
						to={path}
						title={title}
						className="text-xs md:text-sm font-medium hover:text-grey truncate max-w-48"
					>
						{label}
					</Link>
				</Fragment>
			))}
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

function CrumbSeparator() {
	return (
		<svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true" className="size-5 shrink-0 text-grey">
			<path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
		</svg>
	);
}

function FoldedCrumbs({ crumbs }: { crumbs: Breadcrumb[] }) {
	return (
		// Not modal: a modal menu hides the page's scrollbar, which widens the bar it sits in, and a bar fitting itself
		// to the new width can unfold this very menu out from under the pointer.
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Show the rest of the path"
					className="shrink-0 rounded-md px-1 text-muted-foreground hover:bg-accent hover:text-foreground"
				>
					<EllipsisIcon aria-hidden="true" className="size-5" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				{crumbs.map(({ path, label, title }) => (
					<DropdownMenuItem key={path} asChild>
						<Link to={path} title={title}>{label}</Link>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
