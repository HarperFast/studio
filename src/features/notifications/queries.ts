import { apiClient } from '@/config/apiClient';
import { SystemStatusNotification } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

// The central-manager `SystemStatus` resource isn't in the generated OpenAPI types yet, so the URL is
// cast (same approach as getCurrentUser / generateApiToken).
export const systemStatusQueryKey = ['system-status'] as const;

export async function fetchSystemStatus(): Promise<SystemStatusNotification[]> {
	const { data } = await apiClient.get('/SystemStatus/' as '/Cluster/');
	return (Array.isArray(data) ? data : []) as unknown as SystemStatusNotification[];
}

export function getSystemStatusQueryOptions() {
	return queryOptions({
		queryKey: systemStatusQueryKey,
		queryFn: fetchSystemStatus,
		// Live updates arrive over the WebSocket subscription (NotificationsSubscriptionManager); this
		// long interval is only a backstop for when the socket is unavailable.
		refetchInterval: 60_000,
		staleTime: 30_000,
	});
}
