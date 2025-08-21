import { EntityIds } from '@/lib/authStore';
import type { AxiosInstance } from 'axios';

export interface InstanceClientConfig {
	instanceClient: AxiosInstance;
}

export interface InstanceClientIdConfig {
	instanceClient: AxiosInstance;
	entityId: EntityIds;
}
