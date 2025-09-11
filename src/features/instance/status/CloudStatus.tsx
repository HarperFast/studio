import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getStatusQueryOptions } from '@/features/instance/operations/queries/getStatus';
import { Status } from '@/features/instance/status/Status';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Suspense } from 'react';

export function CloudStatus() {
	const instanceParams = useInstanceClientIdParams();
	const { data } = useSuspenseQuery(getStatusQueryOptions(instanceParams));

	return (
		<Suspense fallback={<TextLoadingSkeleton />}>
			<Status data={data} />
		</Suspense>
	);
}
