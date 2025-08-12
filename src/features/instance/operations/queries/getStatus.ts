import { instanceClient } from '@/config/instanceClient';
import { queryOptions } from '@tanstack/react-query';

interface CoreStatus {
	id: string;
	status: string;
	__updatedtime__: number;
	__createdtime__: number;
}

interface AvailabilityStatus extends CoreStatus {
	id: 'availability',
	status: 'Available' | 'Unavailable',
}

interface MaintenanceStatus extends CoreStatus {
	id: 'maintenance',
}

interface PrimaryStatus extends CoreStatus {
	id: 'primary',
}

export type StatusResponse = Array<AvailabilityStatus | MaintenanceStatus | PrimaryStatus>;

export function getStatusQueryOptions(instanceId: string) {
	return queryOptions({
		queryKey: [instanceId, 'get_status'] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post<StatusResponse>('/', {
				operation: 'get_status',
			});
			return data;
		},
		enabled: Boolean(instanceId),
	});
}
