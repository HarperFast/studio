import { getRouteApi, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { X, Menu, List, User, Package, ChartBarBig, NotepadText } from 'lucide-react';

const route = getRouteApi('');

function DesktopInstanceNavBar() {
	const { organizationId, clusterId, instanceId } = route.useParams();
	return (
		<div className="flex-row items-center justify-between hidden p-3 text-sm text-white md:flex">
			<h1 className="text-xl font-bold">Instance:</h1>
			<div className="flex space-x-6 *:hover:text-grey">
				<Link to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/browse`}>
					<List className="inline-block" /> Browse
				</Link>
				<Link to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/users`}>
					<User className="inline-block" /> Users
				</Link>
				<Link to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/roles`}>
					<User className="inline-block" /> Roles
				</Link>
				<Link to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/applications`}>
					<Package className="inline-block" /> Applications
				</Link>
				<Link to={'#contact'}>
					<ChartBarBig className="inline-block" /> Status & Config
				</Link>
				<Link to={`/orgs/${organizationId}/clusters/${clusterId}/instance/${instanceId}/logs`}>
					<NotepadText className="inline-block" /> Logs
				</Link>
			</div>
		</div>
	);
}

function MobileInstanceNavBar() {
	const [isInstanceMenuOpen, setIsInstanceMenuOpen] = useState(false);
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
				<Link to={'#home'} className="hover:text-grey-400">
					Browse
				</Link>
				<Link to={'#about'} className="hover:text-grey-400">
					Users & Roles
				</Link>
				<Link to={'#contact'} className="hover:text-grey-400">
					Applications
				</Link>
				<Link to={'#contact'} className="hover:text-grey-400">
					Status & Config
				</Link>
				<Link to={'#contact'} className="hover:text-grey-400">
					Logs
				</Link>
			</div>
		</div>
	);
}

function InstanceNavBar() {
	return (
		<>
			<MobileInstanceNavBar />
			<DesktopInstanceNavBar />
		</>
	);
}

export default InstanceNavBar;
