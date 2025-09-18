import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Instance } from '@/lib/api.patch';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';

export const InstanceURL = ({
	loadingInstanceInfo,
	instanceInfo,
}: {
	loadingInstanceInfo?: boolean;
	instanceInfo?: Instance | undefined;
}) => {
	const instanceUrl = useMemo(() => instanceInfo ? getOperationsUrlForInstance(instanceInfo) : null, [instanceInfo]);
	return (
		<>
			<dt className="font-bold text-sm/6">Operations URL</dt>
			<dd className="text-sm/6 sm:mt-2">{loadingInstanceInfo
				? (<TextLoadingSkeleton />)
				: instanceUrl
					? (<Link to={instanceUrl} target="_blank" className="underline hover:text-blue-300">{instanceUrl}</Link>)
					: 'N/A'}</dd>
		</>
	);
};
