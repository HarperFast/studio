import { useSuspenseQuery } from '@tanstack/react-query';
import { getInstanceInfoQueryOptions } from '@/features/instance/operations/queries/getInstanceInfoQuery';
import { getRouteApi, Outlet } from '@tanstack/react-router';
import { InstanceNavBar } from '@/features/instance/InstanceNavBar';

const route = getRouteApi('');

export function InstanceLayout() {
	const { clusterId, instanceId } = route.useParams();
	const { isSuccess } = useSuspenseQuery(getInstanceInfoQueryOptions(clusterId, instanceId));

	if (!isSuccess) {
		throw new Error('Instance info not found');
	}
	return (
		<>
			<nav className="fixed top-20 w-full h-12 z-39 px-4 md:px-12 bg-grey-700">
				<InstanceNavBar />
			</nav>
			<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				<Outlet />
			</div>
		</>
	);
}
