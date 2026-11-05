import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useInstanceConfigurationReadPermission, useInstanceManagePermission } from '@/hooks/usePermissions';
import {
	BranchedDatabases,
	entryHasPackage,
	readBranchedDatabases,
	supportsBranchedDatabases,
	supportsPayloadBranchedDatabases,
} from '@/integrations/api/instance/applications/branchedDatabases';
import { getConfigurationQueryOptions } from '@/integrations/api/instance/status/getConfiguration';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { retryUnlessRejected } from '@/react-query/pollUnlessForbidden';
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

function useHarperVersion(enabled: boolean): string | undefined {
	const params = useInstanceClientIdParams();
	return useQuery({ ...getRegistrationInfoQueryOptions(params), enabled }).data?.version;
}

function isRefusal(error: unknown): boolean {
	return isAxiosError(error) && error.response?.status === 403;
}

/**
 * The role check and Harper's gate can disagree. Once Harper refuses the read it stays off, so reopening a dialog
 * neither asks again nor reads as loading meanwhile.
 */
function useConfigurationRead(enabled: boolean) {
	const params = useInstanceClientIdParams();
	const queryClient = useQueryClient();
	const options = getConfigurationQueryOptions(params);
	const refused = isRefusal(queryClient.getQueryState(options.queryKey)?.error);
	return { options, refused, enabled: enabled && !refused };
}

/**
 * Whether to offer the private database copy setting on a package deploy: to a super user, on Harper 5.3.2 or later.
 * An unreadable version offers nothing, since an older 5.3 accepts the setting and runs the application on the shared
 * data.
 */
export function useBranchedDatabasesAvailable(): boolean {
	const canManage = useInstanceManagePermission();
	const version = useHarperVersion(canManage);
	return canManage && supportsBranchedDatabases(version);
}

export function usePayloadBranchedDatabasesAvailable(): boolean {
	const canManage = useInstanceManagePermission();
	const version = useHarperVersion(canManage);
	return canManage && supportsPayloadBranchedDatabases(version);
}

export function useBranchedDatabasesReadable(): boolean {
	const canRead = useInstanceConfigurationReadPermission();
	const version = useHarperVersion(canRead);
	return canRead && supportsBranchedDatabases(version);
}

/**
 * Whether an application may run on a private copy that Studio can't read. Only a version read and known to predate
 * them rules one out: a role without `get_configuration` often can't read `registration_info` either.
 */
export function useBranchedDatabasesPossible(): boolean {
	const params = useInstanceClientIdParams();
	const { data, isSuccess } = useQuery({ ...getRegistrationInfoQueryOptions(params), retry: retryUnlessRejected() });
	return !isSuccess || !data?.version || supportsBranchedDatabases(data.version);
}

interface ConfigurationRead {
	/**
	 * Studio may read the setting: the role can call `get_configuration`, and Harper hasn't refused it. When false the
	 * setting is unknown, never Off.
	 */
	readable: boolean;
	/** `settings` is current: read since Studio last changed the entry. Never true unless `readable`. */
	known: boolean;
	/** A read is outstanding, so `settings` may be about to change, even when `known`. */
	loading: boolean;
	failed: boolean;
	retry: () => void;
}

interface ApplicationPrivateCopy {
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
/**
 * Read from the applications' entries in `get_configuration`, which a super user can call, and any role whose
 * allowlist grants it.
 */
export function useApplicationsBranchedDatabases(projects: readonly string[]): ApplicationsBranchedDatabases {
	const queryClient = useQueryClient();
	const canRead = useInstanceConfigurationReadPermission();
	const { options, refused, enabled } = useConfigurationRead(canRead && projects.length > 0);
	// Through `select`, so the settings keep their identity until they change and can sit in a dependency list.
	const { data, isSuccess, isError, fetchStatus, refetch } = useQuery({
		...options,
		enabled,
		retry: retryUnlessRejected(),
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
		readable: canRead && !refused,
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

/** False until the read lands. */
export function useApplicationEntryHasPackage(project: string | undefined): boolean {
	const canRead = useInstanceConfigurationReadPermission();
	const { options, enabled } = useConfigurationRead(canRead && !!project);
	const { data } = useQuery({
		...options,
		enabled,
		retry: retryUnlessRejected(),
		select: configuration => !!project && entryHasPackage(configuration, project),
	});
	return data === true;
}

/** Call after Studio writes an application's entry, answered or not. */
export async function invalidateApplicationConfiguration(queryClient: QueryClient, entityId: string | undefined) {
	const queryKey = ['get_configuration', entityId];
	// A read already in flight was sent before the write. Invalidating can reuse it, or let it land afterwards, and
	// either way its answer would count as current.
	await queryClient.cancelQueries({ queryKey });
	return queryClient.invalidateQueries({ queryKey });
}
