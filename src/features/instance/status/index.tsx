import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { isLocalStudio } from '@/config/constants';
import { getStatusQueryOptions } from '@/features/instance/operations/queries/getStatus';
import { getSystemInformationQueryOptions } from '@/features/instance/operations/queries/getSystemInformation';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { Suspense } from 'react';

const route = getRouteApi('');

export function StatusIndex() {
	return isLocalStudio ? (<LocalStatus />) : (<CloudStatus />);
}

function LocalStatus() {
	const { instanceId } = route.useParams();
	const { data } = useSuspenseQuery(getSystemInformationQueryOptions(instanceId));

	return (<div className="grid grid-cols-1 gap-4 md:grid-cols-12 min-h-[calc(100vh-theme(spacing.36))]">
		<Suspense fallback={<TextLoadingSkeleton />}>
			<pre>{JSON.stringify(data, null, '\t')}</pre>
		</Suspense>
	</div>);
}

function CloudStatus() {
	const { instanceId } = route.useParams();
	const { data } = useSuspenseQuery(getStatusQueryOptions(instanceId));

	return (<div className="grid grid-cols-1 gap-4 md:grid-cols-12 min-h-[calc(100vh-theme(spacing.36))]">
		<Suspense fallback={<TextLoadingSkeleton />}>
			<pre>{JSON.stringify(data, null, '\t')}</pre>
		</Suspense>
	</div>);
}
