import { apiClient } from '@/config/apiClient';
import { queryKeys } from '@/react-query/constants';
import { useQuery } from '@tanstack/react-query';
import { SchemaOrganizationRole, SchemaUser } from '@/lib/api.gen';

interface OrgRoles extends SchemaOrganizationRole {
	id: string;
	organizationId: string;
	organizationName: string; // TODO: SchemaOrganizationRole does NOT have an organizationName...
	roleName: 'admin' | 'member';
}

// TODO: Consolidate with useOnSignUpSubmitMutation
interface User extends SchemaUser {
	id: string;
	email: string;
	firstname: string;
	lastname: string;
	roles: OrgRoles[];
}

async function getCurrentUser(): Promise<User> {
	// TODO: The OpenAPI SchemaUser has every property as optional.
	const { data } = await apiClient.get('/User/current' as '/User/{id}');
	return data as User;
}

export function useGetCurrentUser() {
	const { data, isLoading } = useQuery({
		queryKey: [queryKeys.user],
		queryFn: getCurrentUser,
		retry: false,
		enabled: import.meta.env.VITE_LOCAL_STUDIO !== 'true',
	});

	return { data, isLoading };
}
