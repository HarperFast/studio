import { InstanceClientConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { useMutation } from '@tanstack/react-query';

export interface DeployComponentFormData {
	applicationName: string;
	applicationUrl: string;
	installCommand?: string;
}

async function onDeployComponentSubmit({
	applicationName,
	applicationUrl,
	installCommand,
	entityType,
	instanceClient,
}: DeployComponentFormData & InstanceClientConfig & InstanceTypeConfig): Promise<ReplicatedResponse> {
	const { data } = await instanceClient.post(
		'/',
		{
			operation: 'deploy_component',
			package: applicationUrl,
			project: applicationName,
			replicated: entityType === 'cluster',
			install_command: installCommand || undefined,
			restart: 'rolling',
		},
		{ timeout: 300_000 },
	);
	return data;
}

export function useDeployComponentMutation() {
	return useMutation({
		mutationFn: onDeployComponentSubmit,
	});
}
