import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getSystemInformationQueryOptions } from '@/features/instance/operations/queries/getSystemInformation';
import { Status } from '@/features/instance/status/Status';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Suspense } from 'react';

export function LocalStatus() {
	const instanceParams = useInstanceClientIdParams();
	const { data } = useSuspenseQuery(getSystemInformationQueryOptions(instanceParams));

	return (
		<Suspense fallback={<TextLoadingSkeleton />}>
			<Status data={data} />
		</Suspense>
	);
}
