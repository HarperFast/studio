import { EntityIds } from '@/lib/authStore';
import type { AxiosInstance } from 'axios';

export interface InstanceClientConfig {
	instanceClient: AxiosInstance;
}

export interface InstanceClientIdConfig extends InstanceClientConfig {
	entityId: EntityIds;
}

export interface InstanceTypeConfig {
	entityType: 'instance' | 'cluster';
}
