import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Cluster } from '@/lib/api.patch';

export const ApplicationURL = ({
	loadingInstanceInfo,
	clusterInfo,
}: {
	loadingInstanceInfo?: boolean;
	clusterInfo?: Cluster | undefined;
}) => {
	return (
		<>
			<dt className="font-bold text-sm/6">Application URL</dt>
			<dd className="text-sm/6 sm:mt-2">{loadingInstanceInfo ? <TextLoadingSkeleton /> : clusterInfo?.fqdn}</dd>
		</>
	);
};
