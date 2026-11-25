import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useInstanceOperationAccess } from '@/hooks/useInstanceOperationPermission';
import { LocalRole } from '@/integrations/api/api.patch';
import { getListRolesQueryOptions } from '@/integrations/api/instance/auth/getListRoles';
import { useQuery } from '@tanstack/react-query';

export interface ListedRoles {
	/** `undefined` until the viewer's grant is known. */
	canList: boolean | undefined;
	roles: LocalRole[] | undefined;
	isLoading: boolean;
}

/**
 * The instance's roles, read only once the viewer is known to hold `list_roles`. A refusal would otherwise reach
 * the error boundary and take the Users page with it.
 */
export function useListedRoles(): ListedRoles {
	const instanceParams = useInstanceClientIdParams();
	const canList = useInstanceOperationAccess('list_roles');
	const { data: roles, isLoading } = useQuery({
		...getListRolesQueryOptions(instanceParams),
		enabled: canList === true,
		throwOnError: true,
	});
	return { canList, roles, isLoading: canList === undefined || isLoading };
}
