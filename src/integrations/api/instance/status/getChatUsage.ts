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
			const response = await fetch(`/Chat/Usage/${orgId}`);
			if (!response.ok) {
				throw new Error('Failed to fetch usage data');
			}
			return response.json();
		},
	});
}

export function useChatUsage() {
	const { organizationId }: { organizationId: string } = useParams({ strict: false });
	return useQuery(getChatUsageQueryOptions(organizationId));
}
