import { createBreadcrumbs } from '@/components/SubNavMenu';
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
import { Link, useLocation } from '@tanstack/react-router';
import { ChartBarBig, GaugeIcon, HomeIcon, List, Menu, NotepadText, Package } from 'lucide-react';

function DesktopInstanceNavBar({ breadcrumb_routes }: { breadcrumb_routes: { name: string; path: string }[] }) {
	const canManage = useInstanceManagePermission();
	return (
		<div className="hidden md:flex items-center justify-between h-full text-sm text-white">
			<ol role="list" className="flex items-center space-x-0 md:space-x-2 pb-2">
					<li>
						<div>
							<Link to="/">
								<HomeIcon aria-hidden="true" className="size-5 shrink-0" />
								<span className="sr-only">Home</span>
							</Link>
						</div>
					</li>
					{breadcrumb_routes.map((page) => (
						<li key={page.name}>
							<div className="flex items-center">
								<svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true" className="size-5 shrink-0 text-grey">
									<path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
								</svg>
								<Link
									to={page.path}
									aria-current={page.name ? 'page' : undefined}
									className="ml-4 text-xs md:text-sm font-medium hover:text-grey"
								>
									{page.name}
								</Link>
							</div>
						</li>
					))}
				</ol>
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

function MobileInstanceNavBar({breadcrumb_routes}: {breadcrumb_routes: { name: string; path: string }[]}) {
	const canManage = useInstanceManagePermission();
	return (
		<>
		<div className="flex md:hidden items-center justify-between p-2 text-white">
			<ol role="list" className="flex items-center space-x-0pb-2">
					<li>
						<div>
							<Link to="/">
								<HomeIcon aria-hidden="true" className="size-5 shrink-0" />
								<span className="sr-only">Home</span>
							</Link>
						</div>
					</li>
					{breadcrumb_routes.map((page) => (
						<li key={page.name}>
							<div className="flex items-center">
								<svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true" className="size-5 shrink-0 text-grey">
									<path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
								</svg>
								<Link
									to={page.path}
									aria-current={page.name ? 'page' : undefined}
									className=" text-xs font-medium hover:text-grey"
								>
									{page.name}
								</Link>
							</div>
						</li>
					))}
				</ol>
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
		</>
	);
}

export function InstanceNavBar() {
	const location = useLocation();
	const breadcrumb_routes = createBreadcrumbs(location);
	breadcrumb_routes.splice(1, 1);
	breadcrumb_routes.splice(2, 1);
	return (
		<>
			<DesktopInstanceNavBar breadcrumb_routes={breadcrumb_routes} />
			<MobileInstanceNavBar breadcrumb_routes={breadcrumb_routes} />
		</>
	);
}
