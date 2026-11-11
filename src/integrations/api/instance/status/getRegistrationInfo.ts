import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { retryUnlessRejected } from '@/react-query/pollUnlessForbidden';
import { queryOptions } from '@tanstack/react-query';

export interface RegistrationInfoResponse {
	version: string;
}

export function getRegistrationInfoQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: ['registration_info', entityId] as const,
		staleTime: 60_000,
		gcTime: 5_000,
		queryFn: async () => {
			const { data } = await instanceClient.post('/', {
				operation: 'registration_info',
			});
			return data as RegistrationInfoResponse;
		},
	});
}

/**
 * The version read for a surface that only adjusts what it offers by it. Harper denies
 * `registration_info` to a role with an operations allowlist, and for such a surface that refusal is an
 * answer ("version unknown"), so it is neither retried nor toasted.
 */
export function getHarperVersionProbeOptions(params: InstanceClientIdConfig) {
	return {
		...getRegistrationInfoQueryOptions(params),
		retry: retryUnlessRejected(),
		meta: { refusalIsAnAnswer: true },
	};
}
