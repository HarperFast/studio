import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { getSystemInformationQueryOptions } from '@/features/instance/operations/queries/getSystemInformation';
import { Status } from '@/features/instance/status/Status';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Suspense } from 'react';
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';

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
