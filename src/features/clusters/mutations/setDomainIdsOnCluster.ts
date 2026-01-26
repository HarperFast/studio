import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

interface Params {
	clusterId: string;
	domainIds: string[];
	generateDomainCerts: boolean;
}

async function setDomainIdsOnCluster({ clusterId, domainIds, generateDomainCerts }: Params) {
	// TODO: API does not describe this endpoint permutation
	const { data } = await apiClient.put(`/Cluster/${clusterId}` as '/Cluster/{id}', {
		domainIds,
		generateDomainCerts,
	}, { timeout: 0 });
	return data;
}

export function useSetDomainIdsOnCluster() {
	return useMutation({
		mutationFn: (params: Params) => setDomainIdsOnCluster(params),
	});
}
