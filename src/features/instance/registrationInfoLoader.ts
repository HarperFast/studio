import { getInstanceClientIdFromParams } from '@/config/useInstanceClient';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { QueryClient } from '@tanstack/react-query';

export function registrationInfoLoader({
	context,
	params,
}: {
	context: { queryClient: QueryClient },
	params: { organizationId?: string; clusterId?: string, instanceId?: string },
}) {
	const operationsParams = getInstanceClientIdFromParams(params);
	return context.queryClient.ensureQueryData(getRegistrationInfoQueryOptions(operationsParams));
}
