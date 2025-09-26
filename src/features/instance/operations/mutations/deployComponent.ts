import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { ReplicatedResponse } from '@/lib/api/replication';
import { useMutation } from '@tanstack/react-query';

export interface DeployComponentFormData {
	applicationName: string;
	applicationUrl: string;
	replicated: boolean;
}

async function onDeployComponentSubmit({
	applicationName,
	applicationUrl,
	instanceClient,
	replicated,
}: DeployComponentFormData & InstanceClientConfig): Promise<ReplicatedResponse> {
	const { data } = await instanceClient.post(
		'/',
		{
			operation: 'deploy_component',
			package: applicationUrl,
			project: applicationName,
			replicated,
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
