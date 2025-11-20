import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { Instance } from '@/integrations/api/api.patch';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { Link } from '@tanstack/react-router';
import { CopyIcon } from 'lucide-react';
import { useMemo } from 'react';

export const InstanceURL = ({
	loadingInstanceInfo,
	instanceInfo,
}: {
	loadingInstanceInfo?: boolean;
	instanceInfo?: Instance | undefined;
}) => {
	const instanceUrl = useMemo(() => instanceInfo ? getOperationsUrlForInstance(instanceInfo) : null, [instanceInfo]);
	const [onCopyClick] = useCopyToClipboard(instanceUrl || '');
	return (
		<>
			<dt className="font-bold text-sm/6">Operations URL</dt>
			<dd className="text-sm/6 sm:mt-2">{loadingInstanceInfo
				? (<TextLoadingSkeleton />)
				: instanceUrl
					? (
						<>
							<Link to={instanceUrl} target="_blank" className="underline hover:text-blue-300">{instanceUrl}</Link>
							<Button
								className="ml-2"
								type="button"
								variant="default"
								size="sm"
								onClick={onCopyClick}
							>
								<CopyIcon className="w-4 h-4" />
							</Button>
						</>)
					: 'N/A'}</dd>
		</>
	);
};
