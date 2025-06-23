import { getRouteApi, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { X, Menu, List, Package, ChartBarBig, NotepadText } from 'lucide-react';

const route = getRouteApi('');

function DesktopInstanceNavBar() {
	const { organizationId, clusterId, instanceId } = route.useParams();
	return (
		<div className="flex-row items-center justify-between hidden h-full text-sm text-white md:flex sm:hidden">
			<h1 className="text-xl font-bold">Instance:</h1>
			<div className="flex space-x-2 *:hover:text-grey">
				<Link to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/browse`} className="p-2">
					<List className="inline-block" /> Browse
				</Link>
				<Link to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/applications`} className="p-2">
					<Package className="inline-block" /> Applications
				</Link>
				<Link to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/config`} className="p-2">
					<ChartBarBig className="inline-block" /> Config
				</Link>
				<Link to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/logs`} className="p-2">
					<NotepadText className="inline-block" /> Logs
				</Link>
			</div>
		</div>
	);
}

function MobileInstanceNavBar() {
	const [isInstanceMenuOpen, setIsInstanceMenuOpen] = useState(false);
	const { organizationId, clusterId, instanceId } = route.useParams();
	return (
		<div className="flex flex-row items-center justify-between p-4 text-white md:hidden bg-grey-700">
			<h1 className="text-xl font-bold">Instance:</h1>
			<button
				type="button"
				className="shadow-xs text-grey-400 hover:text-white hover:bg-black-dark"
				onClick={() => {
					setIsInstanceMenuOpen(!isInstanceMenuOpen);
				}}
			>
				<span className="sr-only">{isInstanceMenuOpen ? 'Close menu' : 'Open menu'}</span>
				{isInstanceMenuOpen ? <X /> : <Menu />}
			</button>
			<div className="flex space-x-4">
				<Link to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/browse`} className="p-2">
					Browse
				</Link>
				<Link to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/applications`} className="p-2">
					Applications
				</Link>
				<Link to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/config`} className="p-2">
					Config
				</Link>
				<Link to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/logs`} className="p-2">
					Logs
				</Link>
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
