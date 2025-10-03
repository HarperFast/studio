import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getStatusQueryOptions } from '@/features/instance/operations/queries/getStatus';
import { Status } from '@/features/instance/status/Status';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Suspense } from 'react';
import { Monitoring } from '@/features/instance/status/components/Monitoring.tsx';

export function CloudStatus() {
	const instanceParams = useInstanceClientIdParams();
	const { data } = useSuspenseQuery(getStatusQueryOptions(instanceParams));

	return (
		<main className="grid grid-cols-1 gap-4 md:grid-cols-12 h[calc(100vh-theme(spacing.40))]">
			<section className="col-span-1 text-white md:col-span-4 lg:col-span-3">
				<Suspense fallback={<TextLoadingSkeleton />}>
					<Status data={data} />
				</Suspense>
			</section>
			<section className="col-span-1 text-white md:col-span-8 lg:col-span-9 flex flex-col">
				<Monitoring instanceClient={instanceParams.instanceClient} />
			</section>
		</main>
	);
}
