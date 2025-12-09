import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { EntityIds } from '@/features/auth/store/authStore';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface InstallUsageLicenseFormData extends InstanceClientConfig {
	license: string;
}

export async function installUsageLicense({ license, instanceClient }: InstallUsageLicenseFormData) {
	const { data } = await instanceClient.post('/', {
		operation: 'install_usage_license',
		license,
	});
	return data;
}

export function useInstallUsageLicenseMutation(entityId: EntityIds) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: installUsageLicense,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: [entityId, 'get_usage_licenses'] }),
	});
}
