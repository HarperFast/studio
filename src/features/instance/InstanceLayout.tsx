import { instanceClient } from '@/config/instanceClient';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getInstanceInfoQueryOptions } from '@/features/instance/queries/getInstanceInfoQuery';
import { Outlet, getRouteApi } from '@tanstack/react-router';
import { InstanceNavBar } from '@/features/instance/InstanceNavBar';
import { isLocalStudio } from '@/config/constants';
import { useEffect } from 'react';

const route = getRouteApi('');

export function InstanceLayout() {
	const { instanceId } = route.useParams();
	const { data: instanceInfo, isSuccess } = useSuspenseQuery(getInstanceInfoQueryOptions(instanceId));

	if (!isSuccess) {
		throw new Error('Instance info not found');
	}
	useEffect(() => {
		if (!isLocalStudio && instanceInfo) {
			// Set the base URL for the instance client to the first FQDN of the instance
			// This allows all subsequent API calls to use the correct base URL for the instance
			instanceClient.defaults.baseURL = instanceInfo.instanceFqdn;
		}
	}, [instanceInfo]);
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
