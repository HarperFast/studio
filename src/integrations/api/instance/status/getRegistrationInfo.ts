import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { retryUnlessRejected } from '@/react-query/pollUnlessForbidden';
import { queryOptions } from '@tanstack/react-query';

export interface RegistrationInfoResponse {
	version: string;
}

/**
 * Harper refuses `registration_info` to a role whose operations allowlist leaves it out (harper v5.4.1
 * `utility/operation_authorization.ts:476`, `:816`). That refusal is an answer, "version unknown": it isn't retried,
 * toasted or reported, even from a route preload (`src/router/DESIGN.md`); a route that needs the version still shows it
 * as its error page. It is set here, not per caller: every surface shares this cache entry, and React Query applies the
 * options of whichever observer rendered or fetched last.
 */
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
		retry: retryUnlessRejected(),
		meta: { refusalIsAnAnswer: true },
	});
}
