import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { supportsOperationsAllowlist } from '@/features/instance/config/roles/operations/operationsCatalog';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { useQuery } from '@tanstack/react-query';

/**
 * Whether this instance accepts `permission.operations`, or `undefined` while the version is still
 * loading. Every reader of a role's `operations` value needs it: below the floor an object under
 * that key is a database named `operations`, while at or above it the same shape is a broken
 * allowlist the UI must not overwrite.
 *
 * `undefined` is deliberately distinct from `false` — collapsing them would report a 5.x instance
 * as pre-allowlist for the first render, which is how a write path could decide a real allowlist is
 * absent and replace it. Callers must resolve it (render nothing, or choose a fail-closed default)
 * rather than pass it on.
 */
export function useOperationsAllowlistSupported(): boolean | undefined {
	const instanceParams = useInstanceClientIdParams();
	const { data: registrationInfo } = useQuery(getRegistrationInfoQueryOptions(instanceParams));
	return registrationInfo === undefined ? undefined : supportsOperationsAllowlist(registrationInfo.version);
}
