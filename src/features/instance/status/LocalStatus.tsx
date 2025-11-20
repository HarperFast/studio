import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { Status } from '@/features/instance/status/Status';
import { getSystemInformationQueryOptions } from '@/integrations/api/instance/status/getSystemInformation';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Suspense } from 'react';

interface LocalStatusParams {
	instanceParams: InstanceClientIdConfig & InstanceTypeConfig;
}

export function LocalStatus({instanceParams}: LocalStatusParams) {
	const { data } = useSuspenseQuery(getSystemInformationQueryOptions(instanceParams));

	return (
		<Suspense fallback={<TextLoadingSkeleton />}>
			<Status data={data} />
		</Suspense>
	);
}
