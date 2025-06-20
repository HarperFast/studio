import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

export type NewOrganizationInfo = {
	orgName: string;
	orgSubdomain: string;
};

type NewClusterInfoResponse = {
	id: string;
	name: string;
	createdByUserId: string;
	subdomain: string;
};

export async function onNewOrganizationSubmit({
	orgName,
	orgSubdomain,
}: NewOrganizationInfo): Promise<NewClusterInfoResponse> {
	const { data } = await apiClient.post('/Organization/', {
		name: orgName,
		subdomain: orgSubdomain,
	});
	if (data) {
		// TODO: The OpenAPI response types for this endpoint aren't very descriptive, but we don't appear to use the response
		return data as never as NewClusterInfoResponse;
	} else {
		throw new Error('Something went wrong');
	}
}

export function useCreateNewOrganizationMutation() {
	return useMutation<NewClusterInfoResponse, Error, NewOrganizationInfo>({
		mutationFn: (clusterInfo) => onNewOrganizationSubmit(clusterInfo),
	});
}
