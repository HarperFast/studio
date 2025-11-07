import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient.tsx';
import { CloudStatus } from '@/features/instance/status/CloudStatus';
import { Monitoring } from '@/features/instance/status/components/Monitoring.tsx';
import { LocalStatus } from '@/features/instance/status/LocalStatus';

export function StatusIndex() {
	const instanceParams = useInstanceClientIdParams();

	return (
		<div className="px-4 py-2 flex">
			{isLocalStudio ? <LocalStatus instanceParams={instanceParams} /> :
				<CloudStatus instanceParams={instanceParams} />}
			<div>
				<Monitoring instanceParams={instanceParams} />
			</div>
		</div>
	);
}
