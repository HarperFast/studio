import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import {
	BranchedDatabases,
	readBranchedDatabases,
	supportsBranchedDatabases,
} from '@/integrations/api/instance/applications/branchedDatabases';
import { getConfigurationQueryOptions } from '@/integrations/api/instance/status/getConfiguration';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Whether to offer the private database copy setting: to a super user, on Harper 5.3.2 or later. An unreadable
 * version offers nothing, since an older 5.3 accepts the setting and runs the application on the shared data.
 */
export function useBranchedDatabasesAvailable(): boolean {
	const params = useInstanceClientIdParams();
	const canManage = useInstanceManagePermission();
	const { data } = useQuery({ ...getRegistrationInfoQueryOptions(params), enabled: canManage });
	return canManage && supportsBranchedDatabases(data?.version);
}

interface ApplicationBranchedDatabases {
	/** The last answer read, which may predate a write of Studio's own. */
	setting: BranchedDatabases | undefined;
	/** `setting` is current: read since anything last changed the entry. Never true for a non super user. */
	known: boolean;
	loading: boolean;
	failed: boolean;
	retry: () => void;
}

/** Read from the application's entry in `get_configuration`, which only a super user can call. */
export function useApplicationBranchedDatabases(project: string | undefined): ApplicationBranchedDatabases {
	const params = useInstanceClientIdParams();
	const queryClient = useQueryClient();
	const canManage = useInstanceManagePermission();
	const enabled = canManage && !!project;
	const options = getConfigurationQueryOptions(params);
	// Through `select`, so the setting keeps its identity until it changes and can sit in a dependency list.
	const { data, isSuccess, isError, fetchStatus, refetch } = useQuery({
		...options,
		enabled,
		select: configuration => (project ? readBranchedDatabases(configuration, project) : undefined),
	});
	// Studio's deploys, activations and drops invalidate the query, and so does a failed read. Until a read succeeds
	// after that, the last answer can be the very setting a redeploy would undo.
	const known = enabled && isSuccess && !queryClient.getQueryState(options.queryKey)?.isInvalidated;
	const failed = enabled && !known && isError && fetchStatus === 'idle';
	return {
		setting: enabled ? data : undefined,
		known,
		loading: enabled && !known && !failed,
		failed,
		retry: () => void refetch(),
	};
}

export function invalidateApplicationConfiguration(queryClient: QueryClient, entityId: string | undefined) {
	return queryClient.invalidateQueries({ queryKey: ['get_configuration', entityId] });
}
