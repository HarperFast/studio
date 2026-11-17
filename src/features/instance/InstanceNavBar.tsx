import { BreadcrumbList, Breadcrumbs, useBreadcrumbTrail } from '@/components/Breadcrumbs';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { InstanceNavLink, useInstanceNavLinks } from '@/features/instance/useInstanceNavLinks';
import { useFitLevel } from '@/hooks/useFitLevel';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { RegistrationInfoResponse } from '@/integrations/api/instance/status/getRegistrationInfo';
import { getStatusQueryOptions, supportsGetStatus } from '@/integrations/api/instance/status/getStatus';
import { cn } from '@/lib/cn';
import { useQuery } from '@tanstack/react-query';
import { Link, useLoaderData, useLocation } from '@tanstack/react-router';
import { EllipsisIcon, Menu } from 'lucide-react';
import { useRef } from 'react';

const activeLinkProps = {
	className: 'text-primary font-semibold bg-primary/10 rounded-md dark:text-white dark:bg-white/10',
};

export function InstanceNavBar() {
	const canManage = useInstanceManagePermission();
	const { version }: RegistrationInfoResponse = useLoaderData({ strict: false });
	const statusAvailable = supportsGetStatus(version) && canManage;

	const instanceParams = useInstanceClientIdParams();
	const { data: statusData } = useQuery(getStatusQueryOptions(instanceParams, statusAvailable));
	const restartRequired = statusData?.restartRequired ?? false;
	const { links, tucked } = useInstanceNavLinks();

	return (
		<>
			<DesktopInstanceNavBar links={links} tucked={tucked} restartRequired={restartRequired} />
			<MobileInstanceNavBar links={links} tucked={tucked} restartRequired={restartRequired} />
		</>
	);
}

interface NavBarProps {
	links: InstanceNavLink[];
	tucked: InstanceNavLink[];
	restartRequired: boolean;
}

interface NavBarLayout {
	labels: boolean;
	collapse: number;
	overflow: number;
}

/** About four letters and an ellipsis: narrower than this, the last crumb no longer says where you are. */
const LAST_CRUMB_FLOOR_PX = 40;

function barOverflows(bar: HTMLElement): boolean {
	const lastCrumb = bar.querySelector<HTMLElement>('[data-last-crumb]');
	const truncatedPastFloor = !!lastCrumb && lastCrumb.clientWidth < LAST_CRUMB_FLOOR_PX
		&& lastCrumb.scrollWidth > lastCrumb.clientWidth;
	return bar.scrollWidth > bar.clientWidth || truncatedPastFloor;
}

/**
 * The order the bar gives things up when short of room: the leading crumb, then the tab names, then one more crumb
 * at a time until only the last is left, which may then truncate; and last, the tabs before the last tab move into
 * More, nearest first. A crumb, once folded, stays folded, so an open "…" menu is never unmounted by a step.
 */
export function navBarLayouts(crumbs: number, tabs: number): NavBarLayout[] {
	const foldable = Math.max(crumbs - 1, 0);
	const firstIconCollapse = Math.min(foldable, 1);
	return [
		{ labels: true, collapse: 0, overflow: 0 },
		...(foldable > 0 ? [{ labels: true, collapse: 1, overflow: 0 }] : []),
		...Array.from(
			{ length: foldable - firstIconCollapse + 1 },
			(_, step) => ({ labels: false, collapse: firstIconCollapse + step, overflow: 0 }),
		),
		...Array.from({ length: Math.max(tabs - 1, 0) }, (_, step) => ({
			labels: false,
			collapse: foldable,
			overflow: step + 1,
		})),
	];
}

function DesktopInstanceNavBar({ links, tucked, restartRequired }: NavBarProps) {
	const barRef = useRef<HTMLDivElement>(null);
	const { pathname } = useLocation();
	const trail = useBreadcrumbTrail();
	const layouts = navBarLayouts(trail.length, links.length);
	const resetKey = [
		pathname,
		trail.map((crumb) => crumb.label).join('/'),
		links.map((link) => `${link.key}=${link.name}`).join(),
		tucked.map((link) => link.key).join(),
		restartRequired,
	].join('\n');
	const { labels, collapse, overflow } = layouts[useFitLevel(barRef, layouts.length, resetKey, barOverflows)];
	const lastCrumbOnly = !labels && collapse === Math.max(trail.length - 1, 0);
	const cut = links.length - 1 - overflow;
	const shown = overflow > 0 ? [...links.slice(0, cut), links[links.length - 1]] : links;
	const moved = overflow > 0 ? links.slice(cut, links.length - 1) : [];

	return (
		// Hover-capable devices get the inline nav from md up (tooltips cover the icon-only
		// layouts). Touch-only devices can't hover those tooltips, so they stay on the hamburger
		// until xl.
		<div
			ref={barRef}
			className="hidden md:[@media(hover:hover)]:flex xl:flex items-center justify-between gap-4 h-full overflow-hidden text-sm text-foreground"
		>
			<BreadcrumbList
				trail={trail}
				restartRequired={restartRequired}
				collapse={collapse}
				// Natural width while the bar measures what fits; only the last crumb ever truncates.
				className={cn('max-w-none sm:max-w-none', lastCrumbOnly ? 'min-w-0' : 'shrink-0')}
			/>
			<div className="flex shrink-0 space-x-2">
				{shown.map(({ key, shortName, ...link }) => {
					const linkElement = (
						<Link
							key={key}
							// The name may be an icon's tooltip, which wires only aria-describedby, so name the link itself.
							aria-label={link.name}
							className="p-2 text-center whitespace-nowrap text-muted-foreground hover:text-foreground"
							activeProps={activeLinkProps}
							{...link}
						>
							{link.icon}
							{labels
								? <span className="ml-1">{link.name}</span>
								: shortName && <span className="ml-1">{shortName}</span>}
						</Link>
					);

					if (labels || shortName) {
						return linkElement;
					}

					return (
						<Tooltip key={key}>
							<TooltipTrigger asChild>{linkElement}</TooltipTrigger>
							<TooltipContent side="bottom">{link.name}</TooltipContent>
						</Tooltip>
					);
				})}
				{moved.length + tucked.length > 0 && <MoreMenu tucked={[...moved, ...tucked]} label={labels} />}
			</div>
		</div>
	);
}

function MoreMenu({ tucked, label }: { tucked: InstanceNavLink[]; label: boolean }) {
	const { pathname } = useLocation();
	// The trigger carries the active style when the open page is one of these, so the nav still says where you are.
	const active = tucked.some((link) =>
		link.activeOptions?.exact ? pathname === link.to : isAtOrUnder(pathname, link.to)
	);
	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="More"
					className={cn(
						'p-2 text-center whitespace-nowrap text-muted-foreground hover:text-foreground',
						active && activeLinkProps.className,
					)}
				>
					<EllipsisIcon className="inline-block" />
					{label && <span className="ml-1">More</span>}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{tucked.map((link) => (
					<DropdownMenuItem key={link.key} asChild>
						<Link
							to={link.to}
							activeOptions={link.activeOptions}
							activeProps={activeLinkProps}
							className="flex items-center gap-2"
						>
							{link.icon}
							{link.name}
						</Link>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function isAtOrUnder(pathname: string, to: string): boolean {
	return pathname === to || pathname.startsWith(`${to}/`);
}

function MobileInstanceNavBar({ links, tucked, restartRequired }: NavBarProps) {
	return (
		<>
			{/* Mirror of DesktopInstanceNavBar: hover devices drop the hamburger at md, touch-only keeps it until xl. */}
			<div className="flex md:[@media(hover:hover)]:hidden xl:hidden items-center justify-between h-full px-2 text-foreground">
				<Breadcrumbs restartRequired={restartRequired} />
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" className="p-0">
							<Menu className="h-8 w-8" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						<DropdownMenuLabel>Instance Menu</DropdownMenuLabel>
						<DropdownMenuSeparator />

						{links.map(link => <MobileLink key={link.key} link={link} />)}
						{tucked.length > 0 && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuLabel className="text-xs text-muted-foreground">More</DropdownMenuLabel>
								{tucked.map(link => <MobileLink key={link.key} link={link} />)}
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</>
	);
}

function MobileLink({ link }: { link: InstanceNavLink }) {
	return (
		<DropdownMenuItem asChild>
			<Link
				to={link.to}
				activeOptions={link.activeOptions}
				activeProps={activeLinkProps}
				className="flex items-center gap-2"
			>
				{link.icon}
				{link.name}
			</Link>
		</DropdownMenuItem>
	);
}
