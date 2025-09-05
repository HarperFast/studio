import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Instance } from '@/lib/api.patch';

export const InstanceURL = ({
	loadingInstanceInfo,
	instanceInfo,
}: {
	loadingInstanceInfo?: boolean;
	instanceInfo?: Instance | undefined;
}) => {
	return (
		<>
			<dt className="font-bold text-sm/6">Instance URL</dt>
			<dd className="text-sm/6 sm:mt-2">{loadingInstanceInfo ? <TextLoadingSkeleton /> : instanceInfo?.instanceFqdn}</dd>
		</>
	);
};
