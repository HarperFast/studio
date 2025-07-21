import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { ChartBarBig, GaugeIcon, List, Menu, NotepadText, Package, X } from 'lucide-react';

const route = getRouteApi('');

function DesktopInstanceNavBar() {
	const { clusterId, instanceId } = route.useParams();
	const canManage = useInstanceManagePermission(instanceId || clusterId);
	return (
		<div className="hidden md:flex items-center justify-between h-full text-sm text-white">
			<h1 className="text-xl font-bold">Instance:</h1>
			<div className="flex space-x-2 *:hover:text-grey">
				<Link to="browse" className="p-2">
					<List className="inline-block" /> Browse
				</Link>
				{canManage && (<>
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
				</>)}
			</div>
		</div>
	);
}

function MobileInstanceNavBar() {
	const { clusterId, instanceId } = route.useParams();
	const canManage = useInstanceManagePermission(instanceId || clusterId);
	const [isInstanceMenuOpen, setIsInstanceMenuOpen] = useState(false);
	const onInstanceMenuClick = useCallback(() => {
		setIsInstanceMenuOpen(!isInstanceMenuOpen);
	}, [isInstanceMenuOpen]);
	return (
		<div className="flex md:hidden items-center justify-between p-4 text-white bg-grey-700">
			<h1 className="text-xl font-bold">Instance:</h1>
			<button
				type="button"
				className="shadow-xs text-grey-400 hover:text-white hover:bg-black-dark"
				onClick={onInstanceMenuClick}
			>
				<span className="sr-only">{isInstanceMenuOpen ? 'Close menu' : 'Open menu'}</span>
				{isInstanceMenuOpen ? <X /> : <Menu />}
			</button>
			<div className="flex space-x-4">
				<Link to="browse" className="p-2">
					Browse
				</Link>
				{canManage && (<>
					<Link to="applications" className="p-2">
						Applications
					</Link>
					<Link to="status" className="p-2">
						Status
					</Link>
					<Link to="config" className="p-2">
						Config
					</Link>
					<Link to="logs" className="p-2">
						Logs
					</Link>
				</>)}
			</div>
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
