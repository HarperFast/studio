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
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { Link, useParams } from '@tanstack/react-router';
import { DatabaseIcon, GaugeIcon, Menu, NotepadText, Package, SettingsIcon } from 'lucide-react';

function DesktopInstanceNavBar() {
	const canManage = useInstanceManagePermission();
	const params = useParams({ strict: false });
	return (
		<div className="hidden md:flex items-center justify-between h-full text-sm text-white">
			<Breadcrumbs />
			<div className="flex space-x-2 *:hover:text-grey">
				<Link to={buildAbsoluteLinkToPage(params)} className="p-2">
					<Package className="inline-block" />
					<span className="hidden xl:inline-block ml-1">Applications</span>
					<span className="visible xl:hidden ml-1"> Apps</span>

				</Link>
				<Link to={buildAbsoluteLinkToPage(params, 'databases')} className="p-2">
					<DatabaseIcon className="inline-block" />
					<span className="hidden xl:inline-block ml-1"> Databases</span>
				</Link>
				{canManage && (
					<>
						<Link to={buildAbsoluteLinkToPage(params, 'status')} className="p-2">
							<GaugeIcon className="inline-block" />
							<span className="hidden xl:inline-block ml-1">Status</span>
						</Link>
						<Link to={buildAbsoluteLinkToPage(params, 'logs')} className="p-2">
							<NotepadText className="inline-block" />
							<span className="hidden xl:inline-block ml-1">Logs</span>
						</Link>
						<Link to={buildAbsoluteLinkToPage(params, 'config')} className="p-2">
							<SettingsIcon className="inline-block" />
							<span className="hidden xl:inline-block ml-1">Config</span>
						</Link>
					</>
				)}
			</div>
		</div>
	);
}

function MobileInstanceNavBar() {
	const canManage = useInstanceManagePermission();
	const params = useParams({ strict: false });
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
						<DropdownMenuItem asChild>
							<Link to={buildAbsoluteLinkToPage(params)}>Applications</Link>
						</DropdownMenuItem>
						<DropdownMenuItem asChild>
							<Link to={buildAbsoluteLinkToPage(params, 'databases')}>Databases</Link>
						</DropdownMenuItem>
						{canManage && (
							<>
								<DropdownMenuItem asChild>
									<Link to={buildAbsoluteLinkToPage(params, 'status')}>Status</Link>
								</DropdownMenuItem>
								<DropdownMenuItem asChild>
									<Link to={buildAbsoluteLinkToPage(params, 'config')}>Config</Link>
								</DropdownMenuItem>
								<DropdownMenuItem asChild>
									<Link to={buildAbsoluteLinkToPage(params, 'logs')}>Logs</Link>
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</>
	);
}

export function InstanceNavBar() {
	return (
		<>
			<DesktopInstanceNavBar />
			<MobileInstanceNavBar />
		</>
	);
}
