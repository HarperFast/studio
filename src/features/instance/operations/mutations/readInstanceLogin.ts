import { instanceClient } from '@/config/instanceClient';
import { useMutation } from '@tanstack/react-query';

// TODO: Consolidate with useOnSignUpSubmitMutation
type InstanceLoginCredentials = {
	instanceUrl: string;
	port?: number;
	username: string;
	password: string;
};

type InstanceLoginResponse = {
	message: string;
};

const onInstanceLoginSubmit = async ({
	instanceUrl,
	port = 9925, // Default port for HarperDB instances
	username,
	password,
}: InstanceLoginCredentials): Promise<InstanceLoginResponse> => {
	const url = instanceUrl.includes(':') ? instanceUrl : `${instanceUrl}:${port}`;
	const { data } = await instanceClient.post(url, {
		operation: 'login',
		username,
		password,
	});
	if (data) {
		return data;
	}
	throw new Error('Something went wrong');
};

const useCreateInstanceLoginMutation = () => {
	return useMutation<InstanceLoginResponse, Error, InstanceLoginCredentials>({
		mutationFn: (instanceData) => onInstanceLoginSubmit(instanceData),
	});
};

export { useCreateInstanceLoginMutation };
export type { InstanceLoginCredentials, InstanceLoginResponse };
