import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { Cluster } from '@/integrations/api/api.patch';
import { CopyIcon } from 'lucide-react';

export const ClusterDomainsList = ({
	loadingInstanceInfo,
	clusterInfo,
}: {
	loadingInstanceInfo?: boolean;
	clusterInfo?: Cluster | undefined;
}) => {
	return (
		<>
			<dt className="font-bold text-sm/6">Cluster Domains</dt>
			<dd className="text-sm/6 sm:mt-2">
				{loadingInstanceInfo
					? <TextLoadingSkeleton />
					: clusterInfo?.domains?.map((domain) => <ClusterDomainUrl key={domain.id} domain={domain.domain} />)}
			</dd>
		</>
	);
};

function ClusterDomainUrl({ domain }: { domain: string }) {
	const [onCopyClick] = useCopyToClipboard(domain || '');
	return (
		<div key={domain}>
			{domain}
			<Button
				className="ml-2"
				type="button"
				variant="default"
				size="sm"
				onClick={onCopyClick}
			>
				<CopyIcon className="w-4 h-4" />
			</Button>
		</div>
	);
}
