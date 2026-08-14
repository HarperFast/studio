import { apiClient } from '@/config/apiClient';
import { systemStatusQueryKey } from '@/features/notifications/queries';
import { SystemStatusNotification } from '@/integrations/api/api.patch';
import { useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Admin CRUD over the central-manager `SystemStatus` table. The resource gates writes on the
 * systemStatus:write staff permission server-side, so these just need the staff session. The
 * SystemStatus paths aren't in the generated OpenAPI types yet, so URLs are cast (as elsewhere).
 * The global MutationCache.onError surfaces failures as a toast; each write refetches the list.
 */
export interface NotificationDraft {
	type: string;
	message: string;
	url?: string | null;
	/** UTC ISO string, or null for an open bound. */
	startAt?: string | null;
	endAt?: string | null;
}

export function useCreateNotificationMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (draft: NotificationDraft) => {
			const { data } = await apiClient.post('/SystemStatus/' as '/Cluster/', draft);
			return data as unknown as SystemStatusNotification;
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: systemStatusQueryKey }),
	});
}

export function useUpdateNotificationMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, draft }: { id: string; draft: NotificationDraft }) => {
			await apiClient.patch(`/SystemStatus/${id}` as '/Cluster/{id}', draft);
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: systemStatusQueryKey }),
	});
}

export function useDeleteNotificationMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			await apiClient.delete(`/SystemStatus/${id}` as '/Cluster/{id}');
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: systemStatusQueryKey }),
	});
}
