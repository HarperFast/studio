import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { supportsPreviews } from '@/integrations/api/instance/previews/previews';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { useQuery } from '@tanstack/react-query';

/** Whether to offer previews: to a super user, on a Harper that has the operations. An unreadable version offers none. */
export function usePreviewsAvailable(): boolean {
	const params = useInstanceClientIdParams();
	const canManage = useInstanceManagePermission();
	const { data } = useQuery({ ...getRegistrationInfoQueryOptions(params), enabled: canManage });
	return canManage && supportsPreviews(data?.version);
}
