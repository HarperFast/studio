import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getStatusQueryOptions } from '@/features/instance/operations/queries/getStatus';
import { getSystemInformationQueryOptions } from '@/features/instance/operations/queries/getSystemInformation';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Suspense } from 'react';

export function StatusIndex() {
	return isLocalStudio ? (<LocalStatus />) : (<CloudStatus />);
}

function LocalStatus() {
	const instanceParams = useInstanceClientIdParams();
	const { data } = useSuspenseQuery(getSystemInformationQueryOptions(instanceParams));

	return (<div className="grid grid-cols-1 gap-4 md:grid-cols-12 min-h-[calc(100vh-theme(spacing.36))]">
		<Suspense fallback={<TextLoadingSkeleton />}>
			<pre>{JSON.stringify(data, null, '\t')}</pre>
		</Suspense>
	</div>);
}

function CloudStatus() {
	const instanceParams = useInstanceClientIdParams();
	const { data } = useSuspenseQuery(getStatusQueryOptions(instanceParams));

	return (<div className="grid grid-cols-1 gap-4 md:grid-cols-12 min-h-[calc(100vh-theme(spacing.36))]">
		<Suspense fallback={<TextLoadingSkeleton />}>
			<pre>{JSON.stringify(data, null, '\t')}</pre>
		</Suspense>
	</div>);
}
