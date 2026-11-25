import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { checkInstanceOperationAllowed } from '@/hooks/checkOperationPermission';
import { useInstanceAuth } from '@/hooks/useAuth';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { useQuery } from '@tanstack/react-query';

/** `undefined` while the answer is loading, for a caller that must wait rather than deny. */
export function useInstanceOperationAccess(operation: string): boolean | undefined {
	const instanceParams = useInstanceClientIdParams();
	const { user } = useInstanceAuth(instanceParams.entityId);
	const registrationInfo = useQuery(getRegistrationInfoQueryOptions(instanceParams));
	const version = registrationInfo.data
		? registrationInfo.data.version || null
		: registrationInfo.isError
		? null
		: undefined;
	return checkInstanceOperationAllowed(user?.role?.permission, operation, version);
}

/** False until the operation is known to be allowed, so it is safe as a query's `enabled`. */
export function useInstanceOperationPermission(operation: string): boolean {
	return useInstanceOperationAccess(operation) === true;
}
