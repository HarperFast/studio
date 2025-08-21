import { getInstanceInfoQueryOptions } from '@/features/cluster/queries/getInstanceInfoQuery';
import { InstanceNavBar } from '@/features/instance/InstanceNavBar';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi, Outlet } from '@tanstack/react-router';

const route = getRouteApi('');

export function InstanceLayout() {
	const params: { instanceId?: string; clusterId?: string; } = route.useParams();
	const { isSuccess } = useSuspenseQuery(getInstanceInfoQueryOptions(params));

	if (!isSuccess) {
		throw new Error('Instance info not found');
	}
	return (
		<>
			<nav className="fixed top-20 w-full z-39 md:px-12 md:py-1 bg-grey-700">
				<InstanceNavBar />
			</nav>
			<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				<Outlet />
			</div>
		</>
	);
}
