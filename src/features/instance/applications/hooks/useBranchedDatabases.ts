import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
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
import { Query, QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

function useHarperVersion(enabled: boolean): string | undefined {
	const params = useInstanceClientIdParams();
	return useQuery({ ...getRegistrationInfoQueryOptions(params), enabled }).data?.version;
}

function isRefusal(error: unknown): boolean {
	return isAxiosError(error) && error.response?.status === 403;
}

/**
 * The role check and Harper's gate can disagree. A refusal is the answer until a read succeeds: it isn't retried, and
 * it holds while a dialog asks again, so the setting doesn't read as loading meanwhile. Every surface that reads this
 * shows a failure itself or hides the setting, so none is toasted.
 */
const CONFIGURATION_READ = {
	retry: retryUnlessRejected(),
	meta: { refusalIsAnAnswer: true, reportsOwnFailure: true },
};

// When each read was refused. A refetch with no data clears the query's `error` before it answers, and the refusal has
// to outlive that, and any failure of another kind, until a read succeeds.
const refusedAt = new WeakMap<Query, number>();

function isRefusedNow(query: Query | undefined): boolean {
	if (!query) {
		return false;
	}
	const { error, errorUpdatedAt, dataUpdatedAt } = query.state;
	if (isRefusal(error)) {
		refusedAt.set(query, errorUpdatedAt);
	}
	const at = refusedAt.get(query);
	return at !== undefined && at > dataUpdatedAt;
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
	const params = useInstanceClientIdParams();
	const queryClient = useQueryClient();
	const canRead = useInstanceConfigurationReadPermission();
	const enabled = canRead && projects.length > 0;
	const options = getConfigurationQueryOptions(params);
	// Through `select`, so the settings keep their identity until they change and can sit in a dependency list.
	const { data, isSuccess, isError, fetchStatus, refetch } = useQuery({
		...options,
		...CONFIGURATION_READ,
		enabled,
		select: configuration =>
			projects.flatMap(project => {
				const setting = readBranchedDatabases(configuration, project);
				return setting ? [{ project, setting }] : [];
			}),
	});
	const refused = enabled
		&& isRefusedNow(queryClient.getQueryCache().find({ queryKey: options.queryKey, exact: true }));
	// A failed read marks the query invalidated too, so only a successful read clears it.
	const known = enabled && isSuccess && !queryClient.getQueryState(options.queryKey)?.isInvalidated;
	const failed = enabled && !known && !refused && isError && fetchStatus === 'idle';
	return {
		settings: (enabled && data) || NO_SETTINGS,
		readable: canRead && !refused,
		known,
		loading: enabled && !failed && !refused && (!known || fetchStatus !== 'idle'),
		failed,
		retry: () => void refetch(),
	};
}

export function useApplicationBranchedDatabases(project: string | undefined): ApplicationBranchedDatabases {
	const { settings, ...read } = useApplicationsBranchedDatabases(project ? [project] : NO_PROJECTS);
	return { ...read, setting: settings[0]?.setting };
}

const NO_PROJECTS: string[] = [];

export function useApplicationEntryHasPackage(project: string | undefined): boolean {
	const params = useInstanceClientIdParams();
	const canRead = useInstanceConfigurationReadPermission();
	const { data } = useQuery({
		...getConfigurationQueryOptions(params),
		...CONFIGURATION_READ,
		enabled: canRead && !!project,
		select: configuration => !!project && entryHasPackage(configuration, project),
	});
	return data === true;
}

/**
 * `project`'s setting as Harper reports it now, or `unknown` when it can't be read, after a write Studio is confirming.
 * A read already in flight was sent before the write, so it is dropped, and the cached answer stops counting as current
 * until this one lands. One try, and a failure is the caller's to show.
 */
export async function readApplicationSetting(
	queryClient: QueryClient,
	params: InstanceClientIdConfig,
	project: string,
): Promise<BranchedDatabases | undefined | 'unknown'> {
	const options = getConfigurationQueryOptions(params);
	await queryClient.cancelQueries({ queryKey: options.queryKey });
	await queryClient.invalidateQueries({ queryKey: options.queryKey, refetchType: 'none' });
	try {
		const configuration = await queryClient.fetchQuery({
			...options,
			...CONFIGURATION_READ,
			retry: false,
			queryFn: async () => {
				const { data } = await params.instanceClient.post('/', { operation: 'get_configuration' }, {
					skipGatewayRetry: true,
				});
				return data;
			},
		});
		return readBranchedDatabases(configuration, project);
	} catch {
		return 'unknown';
	}
}

/**
 * Call after Studio writes an application's entry, answered or not. `refetch: false` for a write that may still be
 * running, which a read now would only see the start of: the setting stays unknown until something reads it again.
 */
export async function invalidateApplicationConfiguration(
	queryClient: QueryClient,
	entityId: string | undefined,
	{ refetch = true }: { refetch?: boolean } = {},
) {
	const queryKey = ['get_configuration', entityId];
	// A read already in flight was sent before the write. Invalidating can reuse it, or let it land afterwards, and
	// either way its answer would count as current.
	await queryClient.cancelQueries({ queryKey });
	return queryClient.invalidateQueries(refetch ? { queryKey } : { queryKey, refetchType: 'none' });
}
