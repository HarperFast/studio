import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { supportsOperationsAllowlist } from '@/features/instance/config/roles/operations/operationsCatalog';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { useQuery } from '@tanstack/react-query';

/**
 * Whether this instance accepts `permission.operations`. Every reader of a role's `operations`
 * value needs it: below the floor an object under that key is a database named `operations`, while
 * at or above it the same shape is a broken allowlist the UI must not overwrite.
 */
export function useOperationsAllowlistSupported(): boolean {
	const instanceParams = useInstanceClientIdParams();
	const { data: registrationInfo } = useQuery(getRegistrationInfoQueryOptions(instanceParams));
	return supportsOperationsAllowlist(registrationInfo?.version);
}
