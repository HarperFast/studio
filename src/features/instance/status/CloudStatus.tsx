import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { getStatusQueryOptions } from '@/features/instance/operations/queries/getStatus';
import { Status } from '@/features/instance/status/Status';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Suspense } from 'react';
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig.ts';

interface CloudStatusParams {
	instanceParams: InstanceClientIdConfig & InstanceTypeConfig;
}

export function CloudStatus({ instanceParams }: CloudStatusParams) {
	const { data } = useSuspenseQuery(getStatusQueryOptions(instanceParams));

	return (
		<Suspense fallback={<TextLoadingSkeleton />}>
			<Status data={data} />
		</Suspense>
	);
}
