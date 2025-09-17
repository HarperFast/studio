import { InstanceClientConfig } from '@/config/instanceClientConfig';
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
}: DeployComponentFormData & InstanceClientConfig) {
	const { data } = await instanceClient.post(
		'/',
		{
			operation: 'deploy_component',
			package: applicationUrl,
			project: applicationName,
			replicated,
			restart: 'rolling',
		},
		{ timeout: 60000 },
	);
	return data;
}

export function useDeployComponentMutation() {
	return useMutation({
		mutationFn: onDeployComponentSubmit,
	});
}
