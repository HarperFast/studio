import { InstanceClientConfig } from '@/config/instanceClientConfig';

interface LogoutInfoResponse {
	message: string;
}

export async function onInstanceLogoutSubmit({ instanceClient }: InstanceClientConfig): Promise<LogoutInfoResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'logout',
	});
	if (data) {
		return data;
	} else {
		throw new Error('Something went wrong');
	}
}
