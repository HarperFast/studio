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

interface ConfigurationRead {
	/** `settings` is current: read since Studio last changed the entry. Never true for a non super user. */
	known: boolean;
	/** A read is outstanding, so `settings` may be about to change, even when `known`. */
	loading: boolean;
	failed: boolean;
	retry: () => void;
}

export interface ApplicationPrivateCopy {
	project: string;
	setting: BranchedDatabases;
}

interface ApplicationsBranchedDatabases extends ConfigurationRead {
	/** The last answer read for each application that has a private copy, which may predate a write of Studio's own. */
	settings: ApplicationPrivateCopy[];
}

interface ApplicationBranchedDatabases extends ConfigurationRead {
	/** The last answer read, which may predate a write of Studio's own. */
	setting: BranchedDatabases | undefined;
}

const NO_SETTINGS: ApplicationPrivateCopy[] = [];
/** Read from the applications' entries in `get_configuration`, which only a super user can call. */
export function useApplicationsBranchedDatabases(projects: readonly string[]): ApplicationsBranchedDatabases {
	const params = useInstanceClientIdParams();
	const queryClient = useQueryClient();
	const canManage = useInstanceManagePermission();
	const enabled = canManage && projects.length > 0;
	const options = getConfigurationQueryOptions(params);
	// Through `select`, so the settings keep their identity until they change and can sit in a dependency list.
	const { data, isSuccess, isError, fetchStatus, refetch } = useQuery({
		...options,
		enabled,
		select: configuration =>
			projects.flatMap(project => {
				const setting = readBranchedDatabases(configuration, project);
				return setting ? [{ project, setting }] : [];
			}),
	});
	// A failed read marks the query invalidated too, so only a successful read clears it.
	const known = enabled && isSuccess && !queryClient.getQueryState(options.queryKey)?.isInvalidated;
	const failed = enabled && !known && isError && fetchStatus === 'idle';
	return {
		settings: (enabled && data) || NO_SETTINGS,
		known,
		loading: enabled && !failed && (!known || fetchStatus !== 'idle'),
		failed,
		retry: () => void refetch(),
	};
}

export function useApplicationBranchedDatabases(project: string | undefined): ApplicationBranchedDatabases {
	const { settings, ...read } = useApplicationsBranchedDatabases(project ? [project] : NO_PROJECTS);
	return { ...read, setting: settings[0]?.setting };
}

const NO_PROJECTS: string[] = [];

/** Call after Studio writes an application's entry, answered or not. */
export async function invalidateApplicationConfiguration(queryClient: QueryClient, entityId: string | undefined) {
	const queryKey = ['get_configuration', entityId];
	// A read already in flight was sent before the write. Invalidating can reuse it, or let it land afterwards, and
	// either way its answer would count as current.
	await queryClient.cancelQueries({ queryKey });
	return queryClient.invalidateQueries({ queryKey });
}
