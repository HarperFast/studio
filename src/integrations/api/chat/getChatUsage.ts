import { apiClient } from '@/config/apiClient';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';

export interface ChatUsage {
	userId: string;
	yearMonth: string;
	usageUSD: number;
	monthlyLimitUSD: number;
	usageBarPercent: number;
}

function getChatUsageQueryOptions(orgId: string) {
	return queryOptions({
		queryKey: ['getMyUsage', orgId],
		queryFn: async (): Promise<ChatUsage> => {
			const { data } = await apiClient.get(`/Chat/Usage/${orgId}` as any);
			return data;
		},
	});
}

export function useChatUsage() {
	const { organizationId }: { organizationId: string } = useParams({ strict: false });
	return useQuery(getChatUsageQueryOptions(organizationId));
}
