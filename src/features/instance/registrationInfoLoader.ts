import { getInstanceClientIdFromParams } from '@/config/useInstanceClient';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { ensureRouteQueryData, RouteLoad } from '@/router/ensureRouteQueryData';

export function registrationInfoLoader(
	route: RouteLoad & { params: { organizationId?: string; clusterId?: string; instanceId?: string } },
) {
	const operationsParams = getInstanceClientIdFromParams(route.params);
	return ensureRouteQueryData(route, getRegistrationInfoQueryOptions(operationsParams));
}
