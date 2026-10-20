import { apiClient } from '@/config/apiClient';
import { configurationQueryKey } from '@/features/admin/configuration/queries/getConfiguration';
import { AdminConfigurationEntry } from '@/integrations/api/api.patch';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/** `expected` is the value the editor opened with. */
export type UpdateConfigurationInput = { name: string; value: unknown; expected: unknown };

/** Central-manager refuses a key this account may not change. */
export async function updateConfiguration({ name, value, expected }: UpdateConfigurationInput): Promise<void> {
	const path = `/Admin/Configuration/${encodeURIComponent(name)}` as '/Admin/Configuration/{name}';
	// PATCH replaces the whole value with no precondition. Re-reading first catches an edit made while the
	// editor was open; one landing between these two requests is still overwritten.
	const { data } = await apiClient.get(path);
	const current = (data as unknown as AdminConfigurationEntry | null)?.value ?? null;
	if (JSON.stringify(current) !== JSON.stringify(expected ?? null)) {
		throw new Error(`${name} was changed by someone else after you opened it. Reopen it to edit the current value.`);
	}
	await apiClient.patch(path, { value });
}

export function useUpdateConfigurationMutation() {
	const queryClient = useQueryClient();
	return useMutation<void, Error, UpdateConfigurationInput>({
		mutationFn: updateConfiguration,
		onSuccess: (_data, { name }) => {
			toast.success(`${name} updated`);
		},
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: configurationQueryKey });
		},
	});
}
