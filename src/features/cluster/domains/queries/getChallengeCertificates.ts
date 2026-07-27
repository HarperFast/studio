import { getInstanceClient } from '@/config/getInstanceClient';
import { getSearchByValue } from '@/integrations/api/instance/database/getSearchByValue';
import { pollUnlessForbidden, retryUnlessForbidden } from '@/react-query/pollUnlessForbidden';
import { queryOptions, useQuery } from '@tanstack/react-query';

export interface ChallengeCertificate {
	domain: string;
	issueDate: string | null;
	renewalDate: string | null;
	challengeToken: string;
	challengeContent: string;
	inProgress: boolean;
}

export function getChallengeCertificatesQueryOptions(clusterId?: string) {
	return queryOptions({
		queryKey: [clusterId, 'ChallengeCertificate'],
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
		// Same always-on shape as the 10s pollers: gated only on `clusterId`, so a
		// user without access to the cluster's data 403s every 5s until they navigate.
		refetchInterval: pollUnlessForbidden(5000),
		retry: retryUnlessForbidden(),
	});
}

export function useChallengeCertificates(clusterId?: string) {
	return useQuery(getChallengeCertificatesQueryOptions(clusterId));
}
