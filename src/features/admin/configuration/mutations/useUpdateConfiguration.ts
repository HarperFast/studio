import { apiClient } from '@/config/apiClient';
import { configurationQueryKey } from '@/features/admin/configuration/queries/getConfiguration';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export type UpdateConfigurationInput = { name: string; value: unknown };

/** Central-manager refuses a key this account may not change. */
export async function updateConfiguration({ name, value }: UpdateConfigurationInput): Promise<void> {
	await apiClient.patch(`/Admin/Configuration/${encodeURIComponent(name)}` as '/Admin/Configuration/{name}', {
		value,
	});
}

export function useUpdateConfigurationMutation() {
	const queryClient = useQueryClient();
	return useMutation<void, Error, UpdateConfigurationInput>({
		mutationFn: updateConfiguration,
		onSuccess: (_data, { name }) => {
			toast.success(`${name} updated`);
			void queryClient.invalidateQueries({ queryKey: configurationQueryKey });
		},
		// The dialog shows the failure next to the editor instead.
		meta: { skipGlobalErrorToast: true },
	});
}
