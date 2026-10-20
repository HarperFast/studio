import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

export type UpdateConfigurationInput = { name: string; value: unknown };

/** PATCH /Admin/Configuration/:name → replace one value. Central-manager refuses keys this account may not change. */
export async function updateConfiguration({ name, value }: UpdateConfigurationInput): Promise<void> {
	await apiClient.patch(`/Admin/Configuration/${encodeURIComponent(name)}` as '/Admin/Configuration/{name}', {
		value,
	});
}

export function useUpdateConfigurationMutation() {
	return useMutation<void, Error, UpdateConfigurationInput>({
		mutationFn: updateConfiguration,
		// The dialog shows the failure next to the editor instead.
		meta: { skipGlobalErrorToast: true },
	});
}
