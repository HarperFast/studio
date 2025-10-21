import { isLocalStudio } from '@/config/constants';
import { CloudStatus } from '@/features/instance/status/CloudStatus';
import { LocalStatus } from '@/features/instance/status/LocalStatus';
import { Monitoring } from '@/features/instance/status/components/Monitoring.tsx';
import { useInstanceClientIdParams } from '@/config/useInstanceClient.tsx';

export function StatusIndex() {
	const instanceParams = useInstanceClientIdParams();

	return (
		<div className="px-4 py-2">
			<div className="">
				<Monitoring instanceParams={instanceParams} />
			</div>
				{isLocalStudio ? <LocalStatus instanceParams={instanceParams} /> : <CloudStatus instanceParams={instanceParams} />}
		</div>
	);
}
