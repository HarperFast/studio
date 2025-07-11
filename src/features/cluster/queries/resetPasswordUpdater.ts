import { apiClient } from '@/config/apiClient';

export async function resetPasswordUpdater(clusterId: string) {
	await apiClient.patch(`/ResetPasswordUpdater/${clusterId}` as '/ResetPasswordUpdater/{id}');
}
