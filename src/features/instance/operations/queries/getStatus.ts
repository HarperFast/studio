import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

interface SystemStatus {
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
	name: ComponentStatusName | string,
	componentName: ComponentStatusName | string,
	status: 'healthy' | string,
	lastChecked: {
		workers: Record<string, number>,
		main: number
	}
}

interface StatusResponse {
	systemStatus: SystemStatus[];
	restartRequired: boolean;
	componentStatus: ComponentStatus[];

	[key: string]: unknown;
}

export function getStatusQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [entityId, 'get_status'] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post<StatusResponse>('/', {
				operation: 'get_status',
			});
			return data;
		},
	});
}
