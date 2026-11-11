import { apiClient } from '@/config/apiClient';
import { retryUnlessRejected } from '@/react-query/pollUnlessForbidden';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';

export interface ChatUsage {
	userId: string;
	yearMonth: string;
	usageUSD: number;
	monthlyLimitUSD: number;
	usageBarPercent: number;
}

/**
 * Central manager refuses org usage to anyone who is not an org admin or holds no chat-read staff
 * permission, so a 403 is the answer for most members: `UsageBar` renders nothing, and it is not toasted.
 */
export function getChatUsageQueryOptions(orgId: string) {
	return queryOptions({
		queryKey: ['getMyUsage', orgId],
		queryFn: async (): Promise<ChatUsage> => {
			const { data } = await apiClient.get(`/Chat/Usage/${orgId}` as any);
			return data;
		},
		retry: retryUnlessRejected(),
		meta: { refusalIsAnAnswer: true },
	});
}

export function useChatUsage() {
	const { organizationId }: { organizationId: string } = useParams({ strict: false });
	return useQuery(getChatUsageQueryOptions(organizationId));
}
