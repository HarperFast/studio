import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient.tsx';
import { StatusTabs } from '@/features/instance/status/analytics/StatusTabs.tsx';

export function StatusIndex() {
	const instanceParams = useInstanceClientIdParams();
	return <StatusTabs instanceParams={instanceParams} isLocalStudio={isLocalStudio} />;
}
