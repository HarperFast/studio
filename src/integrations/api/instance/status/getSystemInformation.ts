import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

interface SystemInformationResponse {
	system: {
		platform: 'darwin' | 'linux' | string;
		distro: 'macOS' | 'Debian GNU/Linux' | string;
		release: string;
		codename: string;
		kernel: string;
		arch: 'arm64' | 'x64' | string;
		hostname: string;
		fqdn: string;
		node_version: string;
		npm_version: string;
	};
	cpu: {
		manufacturer: 'Apple' | 'AMD' | string;
		brand: 'M4' | string;
		vendor: 'Apple' | 'AMD' | string;
		speed: number;
		speedMin: number;
		speedMax: number;
		cores: number;
		physicalCores: number;
		performanceCores: number;
		efficiencyCores: number;
		processors: number;
		flags: string;
		virtualization: boolean;
		cpu_speed: {
			min: number;
			max: number;
			avg: number;
			cores: number[];
		};
		current_load: {
			avgLoad: number;
			currentLoad: number;
			currentLoadUser: number;
			currentLoadSystem: number;
			currentLoadNice: number;
			currentLoadIdle: number;
			currentLoadIrq: number;
			currentLoadSteal: number;
			currentLoadGuest: number;
			rawCurrentLoad: number;
			rawCurrentLoadUser: number;
			rawCurrentLoadSystem: number;
			rawCurrentLoadNice: number;
			rawCurrentLoadIdle: number;
			rawCurrentLoadIrq: number;
			rawCurrentLoadSteal: number;
			rawCurrentLoadGuest: number;
			cpus: Array<{
				load: number;
				loadUser: number;
				loadSystem: number;
				loadNice: number;
				loadIdle: number;
				loadIrq: number;
				loadSteal: number;
				loadGuest: number;
				rawLoadSteal: number;
				rawLoadGuest: number;
			}>;
		};
	};
	memory: {
		total: number;
		free: number;
		used: number;
		active: number;
		available: number;
		reclaimable: number;
		swaptotal: number;
		swapused: number;
		swapfree: number;
		writeback: unknown;
		dirty: unknown;
		rss: number;
		heapTotal: number;
		heapUsed: number;
		external: number;
		arrayBuffers: number;
	};
	disk: Record<string, unknown>;
	network: {
		default_interface: unknown;
		latency: Record<string, unknown>;
		interfaces: Array<Record<string, unknown>>;
		stats: Array<Record<string, unknown>>;
		connections: Array<Record<string, unknown>>;
	};

	[key: string]: unknown;
}

export function getSystemInformationQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [entityId, 'system_information'] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post<SystemInformationResponse>('/', {
				operation: 'system_information',
				attributes: ['network', 'disk', 'cpu', 'memory', 'system'],
			});
			return data;
		},
	});
}
