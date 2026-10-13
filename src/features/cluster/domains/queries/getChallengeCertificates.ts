import { getInstanceClient } from '@/config/getInstanceClient';
import { getSearchByValue } from '@/integrations/api/instance/database/getSearchByValue';
import { pollUnlessForbidden, retryUnlessRejected } from '@/react-query/pollUnlessForbidden';
import { QueryClient, queryOptions, useQuery } from '@tanstack/react-query';

export interface ChallengeCertificate {
	domain: string;
	issueDate: string | null;
	renewalDate: string | null;
	challengeToken: string;
	challengeContent: string;
	inProgress: boolean;
}

export const CERTIFICATE_PROGRESS_POLL_MS = 5_000;
export const CERTIFICATE_IDLE_POLL_MS = 60_000;
/** Central manager answers a domain change before host manager acts on it, and host manager only
 *  writes a cluster's rows once it reconciles the change — after deploying the cert component and
 *  restarting, the first time. So the rows a change produces arrive some time after it succeeds. */
export const CERTIFICATE_WATCH_AFTER_DOMAIN_CHANGE_MS = 3 * 60_000;

const watchingUntil = new Map<string, number>();

export function isGeneratingCertificate(certificate: ChallengeCertificate): boolean {
	return !certificate.issueDate || certificate.inProgress;
}

export function challengeCertificatesQueryKey(clusterId?: string) {
	return [clusterId, 'ChallengeCertificate'] as const;
}

export function watchChallengeCertificates(queryClient: QueryClient, clusterId: string) {
	watchingUntil.set(clusterId, Date.now() + CERTIFICATE_WATCH_AFTER_DOMAIN_CHANGE_MS);
	return queryClient.invalidateQueries({ queryKey: challengeCertificatesQueryKey(clusterId) });
}

function challengeCertificatePollInterval(
	clusterId: string | undefined,
	certificates: ChallengeCertificate[] | undefined,
): number {
	const watching = !!clusterId && (watchingUntil.get(clusterId) ?? 0) > Date.now();
	return watching || certificates?.some(isGeneratingCertificate)
		? CERTIFICATE_PROGRESS_POLL_MS
		: CERTIFICATE_IDLE_POLL_MS;
}

export function getChallengeCertificatesQueryOptions(clusterId?: string) {
	return queryOptions({
		queryKey: challengeCertificatesQueryKey(clusterId),
		queryFn: async () => {
			if (!clusterId) { return []; }
			const instanceClient = getInstanceClient({ id: clusterId, forceFabricConnect: true });
			const { data } = await getSearchByValue<ChallengeCertificate>({
				searchAttribute: 'domain',
				entityId: clusterId,
				databaseName: 'data',
				tableName: 'ChallengeCertificate',
				sort: { attribute: 'domain', descending: true },
				instanceClient,
				onlyIfCached: false,
				pageIndex: 0,
				pageSize: 100,
			});
			return data;
		},
		enabled: !!clusterId,
		refetchInterval: (query) =>
			pollUnlessForbidden(challengeCertificatePollInterval(clusterId, query.state.data))(query),
		retry: retryUnlessRejected(),
	});
}

export function useChallengeCertificates(clusterId?: string) {
	return useQuery(getChallengeCertificatesQueryOptions(clusterId));
}
