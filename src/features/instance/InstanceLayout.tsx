import { getInstanceInfoQueryOptions } from '@/features/cluster/queries/getInstanceInfoQuery';
import { InstanceNavBar } from '@/features/instance/InstanceNavBar';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';

export function InstanceLayout() {
	const params: { instanceId?: string; clusterId?: string; } = useParams({ strict: false });
	const { isSuccess } = useSuspenseQuery(getInstanceInfoQueryOptions(params));

	if (!isSuccess) {
		throw new Error('Instance info not found');
	}
	return (
		<>
			<nav className="fixed top-20 w-full z-39 md:px-12 md:py-1 bg-grey-700">
				<InstanceNavBar />
			</nav>
			<div className="mt-32 min-h-[calc(100vh-theme(spacing.32))]">
				<Outlet />
			</div>
		</>
	);
}
