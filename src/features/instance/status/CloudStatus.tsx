import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig.ts';
import { Status } from '@/features/instance/status/Status';
import { getStatusQueryOptions } from '@/integrations/api/instance/status/getStatus';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Suspense } from 'react';

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
