import { apiClient } from '@/config/apiClient';

export async function resetPasswordUpdater(clusterId: string) {
	// TODO: Need to update our SDK, but the generated swagger is currently invalid >_<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	await apiClient.patch(`/ResetPasswordUpdater/${clusterId}` as any);
}
