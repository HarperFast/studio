import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { getRouteApi, Link } from '@tanstack/react-router';
import { ChartBarBig, GaugeIcon, List, Menu, NotepadText, Package } from 'lucide-react';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { Button } from '@/components/ui/button';

const route = getRouteApi('');

function DesktopInstanceNavBar() {
	const { clusterId, instanceId } = route.useParams();
	const canManage = useInstanceManagePermission(instanceId ?? clusterId);
	return (
		<div className="hidden md:flex items-center justify-between h-full text-sm text-white">
			<h1 className="text-xl font-bold">Instance:</h1>
			<div className="flex space-x-2 *:hover:text-grey">
				<Link to="browse" className="p-2">
					<List className="inline-block" /> Browse
				</Link>
				{canManage && (
					<>
						<Link to="applications" className="p-2">
							<Package className="inline-block" /> Applications
						</Link>
						<Link to="status" className="p-2">
							<GaugeIcon className="inline-block" /> Status
						</Link>
						<Link to="config" className="p-2">
							<ChartBarBig className="inline-block" /> Config
						</Link>
						<Link to="logs" className="p-2">
							<NotepadText className="inline-block" /> Logs
						</Link>
					</>
				)}
			</div>
		</div>
	);
}

function MobileInstanceNavBar() {
	const { clusterId, instanceId } = route.useParams();
	const canManage = useInstanceManagePermission(instanceId ?? clusterId);
	return (
		<div className="flex md:hidden items-center justify-between p-2 text-white">
			<h1 className="text-xl font-bold">Instance</h1>
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
						<Link to="browse">Browse</Link>
					</DropdownMenuItem>
					{canManage && (
						<>
							<DropdownMenuItem asChild>
								<Link to="applications">Applications</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<Link to="status">Status</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<Link to="config">Config</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<Link to="logs">Logs</Link>
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
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
