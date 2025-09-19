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
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { Link, useParams } from '@tanstack/react-router';
import { DatabaseIcon, GaugeIcon, Menu, NotepadTextIcon, PackageIcon, SettingsIcon } from 'lucide-react';
import { ReactNode, useMemo } from 'react';

interface Link {
	to: string;
	name: string;
	shortName?: string;
	icon: ReactNode;
}

export function InstanceNavBar() {
	const canManage = useInstanceManagePermission();
	const params = useParams({ strict: false });
	const links = useMemo(() => [
		{
			to: buildAbsoluteLinkToPage(params),
			name: 'Applications',
			shortName: 'Apps',
			icon: <PackageIcon className="inline-block" />,
		},
		{
			to: buildAbsoluteLinkToPage(params, 'databases'),
			icon: <DatabaseIcon className="inline-block" />,
			name: 'Databases',
		},
		canManage && {
			to: buildAbsoluteLinkToPage(params, 'status'),
			icon: <GaugeIcon className="inline-block" />,
			name: 'Status',
		},
		canManage && {
			to: buildAbsoluteLinkToPage(params, 'logs'),
			icon: <NotepadTextIcon className="inline-block" />,
			name: 'Logs',
		},
		canManage && {
			to: buildAbsoluteLinkToPage(params, 'config'),
			icon: <SettingsIcon className="inline-block" />,
			name: 'Config',
		},
	].filter(excludeFalsy) satisfies Link[], [canManage, params]);
	return (
		<>
			<DesktopInstanceNavBar links={links} />
			<MobileInstanceNavBar links={links} />
		</>
	);
}

function DesktopInstanceNavBar({ links }: { links: Link[] }) {
	return (
		<div className="hidden md:flex items-center justify-between h-full text-sm text-white">
			<Breadcrumbs />
			<div className="flex space-x-2 *:hover:text-grey">
				{links.map(link => (
					<Link key={link.to} to={link.to} className="p-2 text-center">
						{link.icon}
						<span className="hidden xl:inline-block ml-1">{link.name}</span>
						{link.shortName && (
							<span className="visible xl:hidden ml-1"> {link.shortName}</span>
						)}
					</Link>
				))}
			</div>
		</div>
	);
}

function MobileInstanceNavBar({ links }: { links: Link[] }) {
	return (
		<>
			<div className="flex md:hidden items-center justify-between p-2 text-white">
				<Breadcrumbs />
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" className="p-0">
							<Menu className="h-8 w-8" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						<DropdownMenuLabel>Instance Menu</DropdownMenuLabel>
						<DropdownMenuSeparator />

						{links.map(link => (
							<DropdownMenuItem key={link.to} asChild>
								<Link to={link.to}>{link.name}</Link>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</>
	);
}
