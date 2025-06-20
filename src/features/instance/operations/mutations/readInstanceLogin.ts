import { instanceClient } from '@/config/instanceClient';
import { useMutation } from '@tanstack/react-query';

// TODO: Consolidate with useOnSignUpSubmitMutation
type InstanceLoginCredentials = {
	instanceUrl: string;
	username: string;
	password: string;
};

type InstanceLoginResponse = {
	message: string;
};

const onInstanceLoginSubmit = async ({
	instanceUrl,
	username,
	password,
}: InstanceLoginCredentials): Promise<InstanceLoginResponse> => {
	const { data } = await instanceClient.post(`${instanceUrl}`, {
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
