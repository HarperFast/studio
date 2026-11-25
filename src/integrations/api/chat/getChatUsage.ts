import { apiClient } from '@/config/apiClient';
import { isForbiddenError, retryUnlessRejected } from '@/react-query/pollUnlessForbidden';
import { type QueryClient, queryOptions, useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';

export interface ChatUsage {
	userId: string;
	yearMonth: string;
	usageUSD: number;
	monthlyLimitUSD: number;
	usageBarPercent: number;
}

const retry = retryUnlessRejected();

/**
 * Central manager refuses org usage to anyone who is neither an org admin nor chat-read staff, so a 403
 * is the expected answer for most members.
 */
export function getChatUsageQueryOptions(orgId: string) {
	return queryOptions({
		queryKey: ['getMyUsage', orgId],
		queryFn: async (): Promise<ChatUsage> => {
			const { data } = await apiClient.get(`/Chat/Usage/${orgId}` as any);
			return data;
		},
		retry,
		meta: { refusalIsAnAnswer: true },
	});
}

/**
 * After a chat turn, re-read usage so the bar shows what the turn spent. Not while the cached answer is a
 * 403: the refusal won't change per turn. Remount and window refocus still re-ask, so a member granted
 * access later sees the bar without a reload.
 */
export function invalidateChatUsageUnlessRefused(queryClient: QueryClient, orgId: string) {
	const { queryKey } = getChatUsageQueryOptions(orgId);
	if (!isForbiddenError(queryClient.getQueryState(queryKey)?.error)) {
		void queryClient.invalidateQueries({ queryKey });
	}
}

export function useChatUsage() {
	const { organizationId }: { organizationId: string } = useParams({ strict: false });
	return useQuery(getChatUsageQueryOptions(organizationId));
}
