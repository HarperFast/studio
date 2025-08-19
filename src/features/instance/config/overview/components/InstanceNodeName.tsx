import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';

export const InstanceNodeName = ({
	loadingInstanceInfo,
	instanceInfo,
}: {
	loadingInstanceInfo?: boolean;
	instanceInfo?: { name?: string } | undefined;
}) => {
	return (
		<>
			<dt className="font-bold text-sm/6">Instance Node Name (for clustering)</dt>
			<dd className="text-sm/6 sm:mt-2">{loadingInstanceInfo ? <TextLoadingSkeleton /> : instanceInfo?.name}</dd>
		</>
	);
};
