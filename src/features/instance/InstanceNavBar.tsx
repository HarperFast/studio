import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Badge } from '@/components/ui/badge';
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
import { isScopedOperationToken } from '@/features/auth/scopedOperationToken';
import { authStore } from '@/features/auth/store/authStore';
import { InstanceNavLink, useInstanceNavLinks } from '@/features/instance/useInstanceNavLinks';
import { checkInstanceOperationAllowed } from '@/hooks/checkOperationPermission';
import { useInstanceAuth } from '@/hooks/useAuth';
import { RegistrationInfoResponse } from '@/integrations/api/instance/status/getRegistrationInfo';
import { getStatusQueryOptions, supportsGetStatus } from '@/integrations/api/instance/status/getStatus';
import { cn } from '@/lib/cn';
import { useQuery } from '@tanstack/react-query';
import { Link, useLoaderData, useLocation } from '@tanstack/react-router';
import { EllipsisIcon, Menu } from 'lucide-react';
import { useMemo } from 'react';

const activeLinkProps = {
	className: 'text-primary font-semibold bg-primary/10 rounded-md dark:text-white dark:bg-white/10',
};

export function InstanceNavBar() {
	const { version }: RegistrationInfoResponse = useLoaderData({ strict: false });
	const instanceParams = useInstanceClientIdParams();
	const permission = useInstanceAuth(instanceParams.entityId).user?.role?.permission;
	const statusAvailable = supportsGetStatus(version)
		&& checkInstanceOperationAllowed(permission, 'get_status', version) === true;

	const { data: statusData } = useQuery(getStatusQueryOptions(instanceParams, statusAvailable));
	const restartRequired = statusData?.restartRequired ?? false;
	const { links, tucked } = useInstanceNavLinks();
	const operationToken = authStore.getOperationToken(instanceParams.entityId);
	const readOnly = useMemo(() => isScopedOperationToken(operationToken), [operationToken]);

	return (
		<>
			<DesktopInstanceNavBar links={links} tucked={tucked} restartRequired={restartRequired} readOnly={readOnly} />
			<MobileInstanceNavBar links={links} tucked={tucked} restartRequired={restartRequired} readOnly={readOnly} />
		</>
	);
}

interface NavBarProps {
	links: InstanceNavLink[];
	tucked: InstanceNavLink[];
	restartRequired: boolean;
	readOnly: boolean;
}

function DesktopInstanceNavBar({ links, tucked, restartRequired, readOnly }: NavBarProps) {
	return (
		// Hover-capable devices get the inline nav from md up (tooltips cover the icon-only
		// range). Touch-only devices can't hover those tooltips, so they stay on the hamburger
		// until xl, where the full word labels fit.
		<div className="hidden md:[@media(hover:hover)]:flex xl:flex items-center justify-between h-full text-sm text-foreground">
			<Breadcrumbs restartRequired={restartRequired} />
			<div className="flex items-center space-x-2">
				{readOnly && <ReadOnlyBadge />}
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

function MobileInstanceNavBar({ links, tucked, restartRequired, readOnly }: NavBarProps) {
	return (
		<>
			{/* Mirror of DesktopInstanceNavBar: hover devices drop the hamburger at md, touch-only keeps it until xl. */}
			<div className="flex md:[@media(hover:hover)]:hidden xl:hidden items-center justify-between h-full px-2 text-foreground">
				<Breadcrumbs restartRequired={restartRequired} />
				{readOnly && <ReadOnlyBadge />}
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

function ReadOnlyBadge() {
	return (
		<Badge variant="secondary" title="Connected with a read-only token: changes are not available">
			Read-only
		</Badge>
	);
}
