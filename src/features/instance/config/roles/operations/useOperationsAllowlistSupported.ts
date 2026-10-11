import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import {
	GrantBand,
	resolveGrantBand,
	supportsOperationsAllowlist,
} from '@/features/instance/config/roles/operations/operationsCatalog';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

export interface AllowlistVersion {
	/** Whether the instance accepts `permission.operations` at all. */
	supported: boolean;
	/** Which names the instance's allowlist gate can match. */
	band: GrantBand;
}

/**
 * What this instance's version means for a role's `operations` value, or `undefined` while the
 * version is still loading. Every reader of a role's `operations` value needs it: below the floor an
 * object under that key is a database named `operations`, while at or above it the same shape is a
 * broken allowlist the UI must not overwrite.
 *
 * `undefined` is deliberately distinct from "unsupported" — collapsing them would report a 5.x
 * instance as pre-allowlist for the first render, which is how a write path could decide a real
 * allowlist is absent and replace it. Callers must resolve it (render nothing, or choose a fail-closed
 * default) rather than pass it on.
 */
export function useAllowlistVersion(): AllowlistVersion | undefined {
	const instanceParams = useInstanceClientIdParams();
	const { data: registrationInfo } = useQuery(getRegistrationInfoQueryOptions(instanceParams));
	const version = registrationInfo?.version;
	return useMemo(
		() =>
			registrationInfo === undefined
				? undefined
				: { supported: supportsOperationsAllowlist(version), band: resolveGrantBand(version ?? '') },
		[registrationInfo, version],
	);
}

/** {@link useAllowlistVersion}'s support verdict alone, for readers that never count grants. */
export function useOperationsAllowlistSupported(): boolean | undefined {
	return useAllowlistVersion()?.supported;
}
