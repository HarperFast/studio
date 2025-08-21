import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

export interface DeployComponentFormData {
	newApplicationName: string;
	applicationUrl: string;
	replicated: boolean;
}

async function onDeployComponentSubmit({
	newApplicationName,
	applicationUrl,
	instanceClient,
	replicated,
}: DeployComponentFormData & InstanceClientConfig) {
	const { data } = await instanceClient.post(
		'/',
		{
			operation: 'deploy_component',
			package: applicationUrl,
			project: newApplicationName,
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
