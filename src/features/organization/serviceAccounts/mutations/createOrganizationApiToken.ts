import { apiClient } from '@/config/apiClient';
import { CreatedOrganizationApiToken } from '@/integrations/api/api.patch';
import { useMutation } from '@tanstack/react-query';

interface CreateOrganizationApiTokenPayload {
	serviceAccountId: string;
	name: string;
	expiresInDays: number;
}

export async function createOrganizationApiToken(
	payload: CreateOrganizationApiTokenPayload,
): Promise<CreatedOrganizationApiToken> {
	const { data } = await apiClient.post('/ApiToken/' as '/Cluster/', payload);
	return data as unknown as CreatedOrganizationApiToken;
}

export function useCreateOrganizationApiTokenMutation() {
	return useMutation<CreatedOrganizationApiToken, Error, CreateOrganizationApiTokenPayload>({
		mutationFn: createOrganizationApiToken,
		// The result is a bearer credential; the shared MutationCache is readable and survives logout.
		gcTime: 0,
	});
}
