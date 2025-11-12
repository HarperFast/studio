import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { Cluster } from '@/lib/api.patch';
import { CopyIcon } from 'lucide-react';

export const ApplicationURL = ({
	loadingInstanceInfo,
	clusterInfo,
}: {
	loadingInstanceInfo?: boolean;
	clusterInfo?: Cluster | undefined;
}) => {
	const [onCopyClick] = useCopyToClipboard(clusterInfo?.fqdn || '');
	return (
		<>
			<dt className="font-bold text-sm/6">Application URL</dt>
			<dd className="text-sm/6 sm:mt-2">{loadingInstanceInfo
				? <TextLoadingSkeleton />
				: clusterInfo?.fqdn
					? <>
						{clusterInfo.fqdn}
						<Button
							className="ml-2"
							type="button"
							variant="default"
							size="sm"
							onClick={onCopyClick}
						>
							<CopyIcon className="w-4 h-4" />
						</Button>
					</>
					: 'N/A'}</dd>
		</>
	);
};
