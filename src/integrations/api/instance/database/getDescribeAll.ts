import { isLocalStudio } from '@/config/constants';
import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { InstanceDatabaseMap, InstanceDatabaseTableMap } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

// Harper's `describe_all` omits the internal `system` database — server-side it is a
// non-enumerable property, so the operation's `for..in` loop skips it and it never
// reaches Studio. An explicit `describe_database` still resolves it by key, so in dev
// and Local Studio builds we fetch and merge it to make it inspectable.
const exposeSystemDatabase = import.meta.env.DEV || isLocalStudio;

export async function getDescribeAll({ instanceClient }: InstanceClientIdConfig) {
	const { data } = await instanceClient.post<InstanceDatabaseMap>('/', {
		operation: 'describe_all',
	});
	if (!exposeSystemDatabase || data.system) {
		return data;
	}
	try {
		const { data: systemTables } = await instanceClient.post<InstanceDatabaseTableMap>('/', {
			operation: 'describe_database',
			database: 'system',
		});
		return { ...data, system: systemTables };
	} catch {
		// Best-effort dev tooling: if the server denies or lacks the system database,
		// fall back to the unmodified map rather than breaking the databases view.
		return data;
	}
}

export function getDescribeAllQueryOptions(params: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [params.entityId, 'describe_all'] as const,
		queryFn: () => getDescribeAll(params),
		staleTime: 60_000,
		gcTime: 5_000,
		retry: false,
	});
}
