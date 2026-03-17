import { getInstanceClient } from '@/config/getInstanceClient';
import { getSearchByValue } from '@/integrations/api/instance/database/getSearchByValue';
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
				enabled: true,
				instanceClient,
				onlyIfCached: false,
				pageIndex: 0,
				pageSize: 100,
			});
			return data;
		},
		enabled: !!clusterId,
		refetchInterval: 5000,
	});
}

export function useChallengeCertificates(clusterId?: string) {
	return useQuery(getChallengeCertificatesQueryOptions(clusterId));
}
