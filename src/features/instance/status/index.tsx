import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { StatusTabs } from '@/features/instance/status/analytics/StatusTabs';

export function StatusIndex() {
	const instanceParams = useInstanceClientIdParams();
	return <StatusTabs instanceParams={instanceParams} isLocalStudio={isLocalStudio} />;
}
