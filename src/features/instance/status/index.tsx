import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient.tsx';
import { CloudStatus } from '@/features/instance/status/CloudStatus';
import { Monitoring } from '@/features/instance/status/components/Monitoring.tsx';
import { LocalStatus } from '@/features/instance/status/LocalStatus';

export function StatusIndex() {
	const instanceParams = useInstanceClientIdParams();

	return (
		<div className="px-4 py-2 flex flex-col">
			<div className="mb-12">
				<Monitoring instanceParams={instanceParams} />
			</div>
			{isLocalStudio
				? <LocalStatus instanceParams={instanceParams} />
				: <CloudStatus instanceParams={instanceParams} />}
		</div>
	);
}
