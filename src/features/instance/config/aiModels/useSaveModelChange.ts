import { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ModelChange, ModelSaveError, saveModelChange } from './saveModelChange';

interface SaveModelChangeArgs {
	params: InstanceClientIdConfig & InstanceTypeConfig;
	change: ModelChange;
	fabricKeys: ReadonlySet<string> | undefined;
}

/**
 * The page shows a failed save itself, so this skips the global toast, and with it the
 * `console.error` that is how a failed mutation reaches RUM. A refusal Studio made itself is an
 * expected answer and isn't reported; anything else still is, including the failure that stopped a
 * save part-way, which arrives wrapped as the `cause`.
 */
export function useSaveModelChange() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ params, change, fabricKeys }: SaveModelChangeArgs) => saveModelChange(params, change, fabricKeys),
		meta: { skipGlobalErrorToast: true },
		onError: (error) => {
			if (!(error instanceof ModelSaveError)) {
				console.error(error);
			} else if (error.cause !== undefined && !(error.cause instanceof ModelSaveError)) {
				console.error(error.cause);
			}
		},
		// On failure too: a save that stopped part-way has still changed what some instances hold.
		onSettled: (_outcome, _error, { params }) =>
			queryClient.invalidateQueries({ queryKey: ['get_configuration', params.entityId] }),
	});
}
