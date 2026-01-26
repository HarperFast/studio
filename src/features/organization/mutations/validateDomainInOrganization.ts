import { apiClient } from '@/config/apiClient';

export async function validateDomainInOrganization(domainId: string) {
	// TODO: API does not describe this endpoint.
	const { data } = await apiClient.post(
		`/Domain/${domainId}/validate` as any,
	);
	return data;
}
