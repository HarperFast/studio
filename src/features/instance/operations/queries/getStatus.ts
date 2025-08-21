import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
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

type StatusResponse = Array<AvailabilityStatus | MaintenanceStatus | PrimaryStatus>;

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
