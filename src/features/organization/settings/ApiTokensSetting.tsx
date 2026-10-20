import { Switch } from '@/components/ui/switch';
import { apiClient } from '@/config/apiClient';
import { Organization } from '@/integrations/api/api.patch';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

async function patchApiTokensSetting(organizationId: string, enabled: boolean) {
	const { data } = await apiClient.patch(
		`/Organization/${organizationId}/settings/apiTokens` as '/Organization/{id}',
		{ enabled } as never,
	);
	return data as unknown as { organizationId: string; apiTokensEnabled: boolean };
}

export function ApiTokensSetting({ organizationId, enabled }: { organizationId: string; enabled: boolean }) {
	const queryClient = useQueryClient();
	const { mutate, isPending } = useMutation({
		mutationFn: (nextEnabled: boolean) => patchApiTokensSetting(organizationId, nextEnabled),
		onSuccess: ({ apiTokensEnabled }) => {
			toast.success(apiTokensEnabled ? 'API tokens are allowed.' : 'API tokens are now refused.');
			// The switch reads the organization query; show the stored value now rather than after a refetch.
			queryClient.setQueryData<Organization>(
				[organizationId],
				(organization) => organization && { ...organization, settings: { ...organization.settings, apiTokensEnabled } },
			);
			void queryClient.invalidateQueries({ queryKey: [organizationId] });
		},
	});

	return (
		<div className="flex items-center justify-between gap-6 border-b px-4 py-4">
			<div>
				<label htmlFor="allow-api-tokens" className="font-medium text-foreground">Allow API tokens</label>
				<p id="allow-api-tokens-help" className="text-sm text-muted-foreground">
					Service account tokens work only while this is on.
				</p>
			</div>
			<Switch
				id="allow-api-tokens"
				aria-describedby="allow-api-tokens-help"
				checked={enabled}
				disabled={isPending}
				onCheckedChange={mutate}
			/>
		</div>
	);
}
