import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { useMemo } from 'react';

export const InstanceNodeName = ({
	loadingInstanceInfo,
	instanceInfo,
}: {
	loadingInstanceInfo?: boolean;
	instanceInfo?: { name?: string } | undefined;
}) => {
	const simplifiedName = useMemo(() => instanceInfo?.name?.split('.')[0], [instanceInfo?.name]);
	return (
		<>
			<dt className="font-bold text-sm/6">Instance Name</dt>
			<dd className="text-sm/6 sm:mt-2">{loadingInstanceInfo ? <TextLoadingSkeleton /> : simplifiedName}</dd>
		</>
	);
};
