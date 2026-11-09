import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

interface ConfigurationInfoResponse {
	license_expiration_date: string;
	ram_allocation: number;
	registered: boolean;
	version: string;
	http: {
		port: number | null;
		securePort: number | null;
		cors: boolean;
		corsAccessList: string[];
	};
	/** harper-pro only. The mode and threshold the firewall falls back to until `set_waf_mode` stores its own. */
	waf?: { enabled?: unknown; mode?: unknown; scoreThreshold?: unknown };
}

export function getConfigurationQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: ['get_configuration', entityId] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post('/', {
				operation: 'get_configuration',
			});
			return data as ConfigurationInfoResponse;
		},
	});
}
