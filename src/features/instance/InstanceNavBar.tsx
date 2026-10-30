import { Breadcrumbs } from '@/components/Breadcrumbs';
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
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { RegistrationInfoResponse } from '@/integrations/api/instance/status/getRegistrationInfo';
import { getStatusQueryOptions, supportsGetStatus } from '@/integrations/api/instance/status/getStatus';
import { cn } from '@/lib/cn';
import { useQuery } from '@tanstack/react-query';
import { Link, useLoaderData, useLocation } from '@tanstack/react-router';
import { EllipsisIcon, Menu } from 'lucide-react';

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

function DesktopInstanceNavBar({ links, tucked, restartRequired }: NavBarProps) {
	return (
		// Hover-capable devices get the inline nav from md up (tooltips cover the icon-only
		// range). Touch-only devices can't hover those tooltips, so they stay on the hamburger
		// until xl, where the full word labels fit.
		<div className="hidden md:[@media(hover:hover)]:flex xl:flex items-center justify-between h-full text-sm text-foreground">
			<Breadcrumbs restartRequired={restartRequired} />
			<div className="flex space-x-2">
				{links.map(({ key, shortName, ...link }) => {
					const linkElement = (
						<Link
							key={key}
							// The label is display:none below xl, so give the link a stable accessible name
							// (the tooltip only wires aria-describedby, a description, not a name).
							aria-label={link.name}
							className="p-2 text-center text-muted-foreground hover:text-foreground"
							activeProps={activeLinkProps}
							{...link}
						>
							{link.icon}
							<span className="hidden xl:inline-block ml-1">{link.name}</span>
							{shortName && <span className="visible xl:hidden ml-1">{shortName}</span>}
						</Link>
					);

					// Links with a shortName always show a text label, so a tooltip would be
					// redundant. Only the icon-only links (no shortName, hidden name below xl)
					// need one, and it's suppressed at xl+ where the full name is visible.
					if (shortName) {
						return linkElement;
					}

					return (
						<Tooltip key={key}>
							<TooltipTrigger asChild>{linkElement}</TooltipTrigger>
							<TooltipContent side="bottom" className="xl:hidden">{link.name}</TooltipContent>
						</Tooltip>
					);
				})}
				{tucked.length > 0 && <MoreMenu tucked={tucked} />}
			</div>
		</div>
	);
}

/** The tabs a cluster tucked away: one click further, still there. */
function MoreMenu({ tucked }: { tucked: InstanceNavLink[] }) {
	const { pathname } = useLocation();
	// The trigger carries the active style when the open page is one of these, so the nav still says where you are.
	const active = tucked.some((link) =>
		link.activeOptions?.exact ? pathname === link.to : isAtOrUnder(pathname, link.to)
	);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="More"
					className={cn(
						'p-2 text-center text-muted-foreground hover:text-foreground',
						active && activeLinkProps.className,
					)}
				>
					<EllipsisIcon className="inline-block" />
					<span className="hidden xl:inline-block ml-1">More</span>
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
