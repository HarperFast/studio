import { useMutation } from '@tanstack/react-query';
import instanceClient from '@/config/instanceClient';

type DeployComponentFormData = {
	newApplicationName: string;
	applicationUrl: string;
};

const onDeployComponentSubmit = async (formData: DeployComponentFormData) => {
	const { newApplicationName, applicationUrl } = formData;
	const { data } = await instanceClient.post('/', {
		operation: 'deploy_component',
		package: applicationUrl,
		project: newApplicationName,
	});
	return data;
};

const useDeployComponentMutation = () => {
	return useMutation({
		mutationFn: (formData: DeployComponentFormData) => onDeployComponentSubmit(formData),
	});
};

export { useDeployComponentMutation };
export type { DeployComponentFormData };
