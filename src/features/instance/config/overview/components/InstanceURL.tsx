import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Cluster } from '@/lib/api.patch';

export const InstanceURL = ({
	loadingInstanceInfo,
	clusterInfo,
}: {
	loadingInstanceInfo?: boolean;
	clusterInfo?: Cluster | undefined;
}) => {
	return (
		<>
			<dt className="font-bold text-sm/6">Instance URL</dt>
			{/* @ts-expect-error  tried following the types and it seems we are stacking them we have to figure out a better way to type this so url doesn't cause a type error */}
			<dd className="text-sm/6 sm:mt-2">{loadingInstanceInfo ? <TextLoadingSkeleton /> : clusterInfo?.url}</dd>
		</>
	);
};
