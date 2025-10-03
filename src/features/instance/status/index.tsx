import { isLocalStudio } from '@/config/constants';
import { CloudStatus } from '@/features/instance/status/CloudStatus';
import { LocalStatus } from '@/features/instance/status/LocalStatus';
import { Monitoring } from '@/features/instance/status/components/Monitoring.tsx';
import { useInstanceClientIdParams } from '@/config/useInstanceClient.tsx';

export function StatusIndex() {
	const instanceParams = useInstanceClientIdParams();

	return (
		<main className="grid grid-cols-1 gap-4 md:grid-cols-12 h-[calc(100vh-theme(spacing.40))]">
			<section className="col-span-1 text-white md:col-span-4 lg:col-span-3">
				{isLocalStudio ? <LocalStatus instanceParams={instanceParams} /> : <CloudStatus instanceParams={instanceParams} />}
			</section>
			<section className="col-span-1 text-white md:col-span-8 lg:col-span-9 flex flex-col">
				<Monitoring instanceParams={instanceParams} />
			</section>
		</main>
	);
}
