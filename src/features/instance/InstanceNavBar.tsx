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
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { RegistrationInfoResponse } from '@/integrations/api/instance/status/getRegistrationInfo';
import { getStatusQueryOptions } from '@/integrations/api/instance/status/getStatus';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { useQuery } from '@tanstack/react-query';
import { Link, useLoaderData, useParams } from '@tanstack/react-router';
import { DatabaseIcon, GaugeIcon, Menu, NotepadTextIcon, PackageIcon, ServerIcon, SettingsIcon } from 'lucide-react';
import { ReactNode, useMemo } from 'react';

interface Link {
	to: string;
	name: string;
	shortName?: string;
	icon: ReactNode;
}

const activeLinkProps = { className: 'text-white' };

export function InstanceNavBar() {
	const canManage = useInstanceManagePermission();
	const params = useParams({ strict: false });


	const instanceParams = useInstanceClientIdParams();
	const { data: statusData } = useQuery(getStatusQueryOptions(instanceParams));
	const restartRequired = statusData?.restartRequired ?? false;

	const { version }: RegistrationInfoResponse = useLoaderData({ strict: false });
	const apisAvailable = wasAReleasedBeforeB('4.7.0-beta.7', version);
	const statusAvailable = wasAReleasedBeforeB('4.6.0', version);

	const links = useMemo(() => [
		{
			to: buildAbsoluteLinkToPage(params),
			activeOptions: { exact: true },
			name: 'Applications',
			shortName: 'Apps',
			icon: <PackageIcon className="inline-block" />,
		},
		{
			to: buildAbsoluteLinkToPage(params, 'databases'),
			icon: <DatabaseIcon className="inline-block" />,
			name: 'Databases',
		},
		canManage && apisAvailable && {
			to: buildAbsoluteLinkToPage(params, 'apis'),
			name: 'APIs',
			icon: <ServerIcon className="inline-block" />,
		},
		canManage && statusAvailable && {
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
	].filter(excludeFalsy) satisfies Link[], [canManage, params, apisAvailable, statusAvailable]);
	return (
		<>
			<DesktopInstanceNavBar links={links} restartRequired={restartRequired} />
			<MobileInstanceNavBar links={links} restartRequired={restartRequired} />
		</>
	);
}

function DesktopInstanceNavBar({ links, restartRequired }: { links: Link[], restartRequired: boolean }) {
	return (
		<div className="hidden md:flex items-center justify-between h-full text-sm text-white">
			<Breadcrumbs restartRequired={restartRequired} />
			<div className="flex space-x-2">
				{links.map(({ shortName, ...link }) => (
					<Link
						key={link.to}
						className="p-2 text-center text-gray-400 hover:text-white"
						activeProps={activeLinkProps}
						{...link}
					>
						{link.icon}
						<span className="hidden xl:inline-block ml-1">{link.name}</span>
						{shortName && (
							<span className="visible xl:hidden ml-1"> {shortName}</span>
						)}
					</Link>
				))}
			</div>
		</div>
	);
}

function MobileInstanceNavBar({ links, restartRequired }: { links: Link[], restartRequired: boolean }) {
	return (
		<>
			<div className="flex md:hidden items-center justify-between p-2 text-white">
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

						{links.map(link => (
							<DropdownMenuItem key={link.to} asChild>
								<Link to={link.to} activeProps={activeLinkProps}>{link.name}</Link>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</>
	);
}
