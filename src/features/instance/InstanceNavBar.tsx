import { BreadcrumbList, useBreadcrumbTrail } from '@/components/Breadcrumbs';
import { navigationActiveProps, navigationInactiveProps, navigationLinkClasses } from '@/components/navigationStyles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { isScopedOperationToken } from '@/features/auth/scopedOperationToken';
import { authStore } from '@/features/auth/store/authStore';
import { InstanceNavLink, useInstanceNavLinks } from '@/features/instance/useInstanceNavLinks';
import { useLoadedInstanceVersion } from '@/features/instance/useLoadedInstanceVersion';
import { checkInstanceOperationAllowed } from '@/hooks/checkOperationPermission';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useFitLevel } from '@/hooks/useFitLevel';
import { getStatusQueryOptions, supportsGetStatus } from '@/integrations/api/instance/status/getStatus';
import { cn } from '@/lib/cn';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { useQuery } from '@tanstack/react-query';
import { Link, useMatchRoute, useParams } from '@tanstack/react-router';
import { CheckIcon, ChevronDownIcon, EllipsisIcon, MenuIcon } from 'lucide-react';
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';

export function InstanceNavBar() {
	const version = useLoadedInstanceVersion();
	return version === undefined ? null : <InstanceNavBarFor version={version} />;
}

function InstanceNavBarFor({ version }: { version: string }) {
	const instanceParams = useInstanceClientIdParams();
	const permission = useInstanceAuth(instanceParams.entityId).user?.role?.permission;
	const statusAvailable = supportsGetStatus(version)
		&& checkInstanceOperationAllowed(permission, 'get_status', version) === true;
	const { data: statusData } = useQuery(getStatusQueryOptions(instanceParams, statusAvailable));
	const { links, tucked } = useInstanceNavLinks(version);
	const operationToken = authStore.getOperationToken(instanceParams.entityId);
	const readOnly = useMemo(() => isScopedOperationToken(operationToken), [operationToken]);
	const trail = useBreadcrumbTrail();
	const params = useParams({ strict: false });
	const entityPath = params.clusterId ? buildAbsoluteLinkToPage(params) : trail[0]?.path;
	const crumbRegion = useRef<HTMLElement>(null);
	const crumbLayouts = [
		{},
		...(trail.length > 2 ? [{ collapse: 1 }] : []),
		...(entityPath && trail.length > 1 ? [{ keepPath: entityPath }] : []),
	];
	const crumbLayout = crumbLayouts[
		useFitLevel(
			crumbRegion,
			crumbLayouts.length,
			JSON.stringify([trail, statusData?.restartRequired, readOnly]),
		)
	];
	const matchRoute = useMatchRoute();
	const bar = useRef<HTMLDivElement>(null);
	const inlineLinks = useRef<HTMLDivElement>(null);
	const [compact, setCompact] = useState(false);

	useLayoutEffect(() => {
		const barElement = bar.current;
		const linksElement = inlineLinks.current;
		if (!barElement || !linksElement) {
			return;
		}

		const update = () => {
			const width = barElement.getBoundingClientRect().width;
			if (width > 0) {
				setCompact(linksElement.getBoundingClientRect().width > (width * 2) / 3);
			}
		};
		update();
		if (typeof ResizeObserver !== 'undefined') {
			const observer = new ResizeObserver(update);
			observer.observe(barElement);
			observer.observe(linksElement);
			return () => observer.disconnect();
		}
	}, []);

	const isActive = ({ to, activeOptions }: InstanceNavLink) =>
		matchRoute({ to, fuzzy: !activeOptions?.exact, includeSearch: false, caseSensitive: true }) !== false;
	const tuckedActive = tucked.find(isActive);
	const active = compact ? links.find(isActive) ?? tuckedActive : undefined;

	return (
		<div ref={bar} className="relative flex h-full min-w-0 items-center justify-between gap-2 text-foreground">
			<nav ref={crumbRegion} aria-label="Breadcrumbs" className="min-w-0 flex-1">
				<BreadcrumbList
					trail={trail}
					{...crumbLayout}
					restartRequired={statusData?.restartRequired}
					className={cn(
						'max-w-none sm:max-w-none',
						crumbLayout.keepPath ? 'gap-1 space-x-0 xl:space-x-0 [&>svg]:size-3' : '[&>a]:shrink-0',
					)}
				/>
			</nav>
			{readOnly && <ReadOnlyBadge />}
			<nav aria-label="Studio sections" className={compact ? 'min-w-0 max-w-1/2' : undefined}>
				<div
					className={compact ? 'pointer-events-none invisible absolute inset-0 overflow-clip' : undefined}
					inert={compact}
				>
					<div ref={inlineLinks} className="flex w-max items-center gap-1 whitespace-nowrap">
						{links.map(link => (
							<Link
								key={link.key}
								to={link.to}
								className={navigationLinkClasses}
								activeOptions={{ ...link.activeOptions, includeSearch: false }}
								activeProps={navigationActiveProps}
								inactiveProps={navigationInactiveProps}
							>
								<SectionLabel icon={link.icon}>{link.name}</SectionLabel>
							</Link>
						))}
						{tucked.length > 0 && (
							<SectionMenu
								key={compact ? 'hidden' : 'visible'}
								primary={[]}
								tucked={tucked}
								trigger={
									<Button variant="ghost" className={tuckedActive && navigationActiveProps.className}>
										<EllipsisIcon aria-hidden="true" /> More
									</Button>
								}
							/>
						)}
					</div>
				</div>
				{compact && (
					<SectionMenu
						primary={links}
						tucked={tucked}
						trigger={
							<Button
								variant="outline"
								className="max-w-full gap-1.5 px-2.5"
								aria-label={active ? `Studio sections · ${active.name}` : 'Studio sections'}
							>
								<SectionLabel icon={active?.icon ?? <MenuIcon />} truncate>{active?.name ?? 'Sections'}</SectionLabel>
								<ChevronDownIcon className="shrink-0 text-muted-foreground" aria-hidden="true" />
							</Button>
						}
					/>
				)}
			</nav>
		</div>
	);
}

function SectionMenu({ primary, tucked, trigger }: {
	primary: InstanceNavLink[];
	tucked: InstanceNavLink[];
	trigger: ReactNode;
}) {
	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				collisionPadding={8}
				className="w-64 max-w-(--radix-dropdown-menu-content-available-width)"
			>
				{primary.length > 0 && (
					<DropdownMenuGroup aria-label="Studio sections">
						<DropdownMenuLabel>Studio sections</DropdownMenuLabel>
						{primary.map(link => <SectionMenuItem key={link.key} link={link} />)}
					</DropdownMenuGroup>
				)}
				{tucked.length > 0 && (
					<>
						{primary.length > 0 && <DropdownMenuSeparator />}
						<DropdownMenuGroup aria-label="More">
							<DropdownMenuLabel>More</DropdownMenuLabel>
							{tucked.map(link => <SectionMenuItem key={link.key} link={link} />)}
						</DropdownMenuGroup>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function SectionMenuItem({ link }: { link: InstanceNavLink }) {
	return (
		<DropdownMenuItem asChild>
			<Link
				to={link.to}
				activeOptions={{ ...link.activeOptions, includeSearch: false }}
				activeProps={navigationActiveProps}
				className="min-h-10 gap-2"
			>
				<SectionLabel icon={link.icon}>{link.name}</SectionLabel>
				<CheckIcon className="invisible ml-auto shrink-0 [[aria-current=page]>&]:visible" aria-hidden="true" />
			</Link>
		</DropdownMenuItem>
	);
}

function SectionLabel({ icon, children, truncate }: { icon: ReactNode; children: ReactNode; truncate?: boolean }) {
	return (
		<>
			<span className="shrink-0 [&_svg]:size-4" aria-hidden="true">{icon}</span>
			<span className={cn('min-w-0', truncate ? 'truncate' : 'whitespace-normal [overflow-wrap:anywhere]')}>
				{children}
			</span>
		</>
	);
}

function ReadOnlyBadge() {
	return (
		<Badge variant="secondary" className="shrink-0" title="Connected with a read-only token: changes are not available">
			Read-only
		</Badge>
	);
}
