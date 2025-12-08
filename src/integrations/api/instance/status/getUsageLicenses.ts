import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

interface UsageLicense {
	id: string;
	level: string;
	region: string;
	reads: string;
	writes: string;
	readBytes: string;
	writeBytes: string;
	realTimeMessages: string;
	realTimeBytes: string;
	cpuTime: string;
	storage: string;
	usedReads: string;
	usedWrites: string;
	usedReadBytes: string;
	usedWriteBytes: string;
	usedRealTimeMessages: string;
	usedRealTimeBytes: string;
	usedCpuTime: string;
	usedStorage: string;
	expiration: string;
	autoRenew: string;
	__createdtime__: string;
	__updatedtime__: string;
}

export function getUsageLicensesQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig, enabled: boolean) {
	return queryOptions({
		queryKey: [entityId, 'get_usage_licenses'] as const,
		enabled,
		queryFn: async () => {
			try {
				const { data } = await instanceClient.post<UsageLicense[]>('/', {
					operation: 'get_usage_licenses',
				});
				return data;
			}
			catch (err) {
				console.error(err);
				return null;
			}
		},
	});
}
