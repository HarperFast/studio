import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { pollUnlessForbidden } from '@/react-query/pollUnlessForbidden';
import { queryOptions } from '@tanstack/react-query';

export interface SystemStatus {
	id: 'availability' | 'maintenance' | 'primary' | string;
	status: 'Available' | 'Unavailable' | string;
	__updatedtime__: number;
	__createdtime__: number;
}

const enum ComponentStatusName {
	'hdb.http' = 'hdb.http',
	'hdb.authentication' = 'hdb.authentication',
	'hdb.replication' = 'hdb.replication',
	'hdb.logging' = 'hdb.logging',
	'hdb.mqtt' = 'hdb.mqtt',
	'hdb.operationsApi' = 'hdb.operationsApi',
	'status-check.rest' = 'status-check.rest',
	'status-check.jsResource' = 'status-check.jsResource',
}

interface ComponentStatus {
	name: ComponentStatusName | string;
	componentName: ComponentStatusName | string;
	status: 'healthy' | string;
	lastChecked: {
		workers: Record<string, number>;
		main: number;
	};
}

interface StatusResponse {
	systemStatus: SystemStatus[];
	restartRequired: boolean;
	componentStatus: ComponentStatus[];

	[key: string]: unknown;
}

export function getStatusQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig, enabled?: boolean) {
	return queryOptions({
		queryKey: ['get_status', entityId] as const,
		staleTime: 9_000,
		// An instance the user can't operate answers 403 on every poll — stop the
		// timer instead of re-asking every 10s (one such row emitted 348 doomed
		// requests in under an hour).
		refetchInterval: pollUnlessForbidden(10_000),
		retryDelay: 10_000,
		throwOnError: false,
		enabled,
		queryFn: async () => {
			const { data } = await instanceClient.post<StatusResponse>('/', {
				operation: 'get_status',
			});
			return data;
		},
	});
}

export function getSystemStatusById(
	statusResponse: StatusResponse | undefined,
	id: SystemStatus['id'],
): SystemStatus['status'] | undefined {
	const systemStatus = statusResponse?.systemStatus?.find(s => s.id === id);
	return systemStatus?.status;
}
