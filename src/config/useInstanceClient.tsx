import { isLocalStudio } from '@/config/constants';
import { getInstanceClient } from '@/config/getInstanceClient';
import { InstanceClientConfig, InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { OverallAppSignIn } from '@/lib/authStore';
import { useParams } from '@tanstack/react-router';

export function useInstanceClient(operationsUrl?: string | null) {
	const { instanceId, clusterId }: { instanceId?: string; clusterId?: string; } = useParams({ strict: false });
	const id = isLocalStudio ? OverallAppSignIn : instanceId ?? clusterId;
	return getInstanceClient(id, operationsUrl);
}

export function useInstanceClientParams(operationsUrl?: string | null): InstanceClientConfig & InstanceTypeConfig {
	const { instanceId, clusterId }: { instanceId?: string; clusterId?: string; } = useParams({ strict: false });
	const id = isLocalStudio ? OverallAppSignIn : instanceId ?? clusterId;
	return {
		instanceClient: getInstanceClient(id, operationsUrl),
		entityType: (isLocalStudio || instanceId) ? 'instance' : 'cluster',
	};
}

export function useInstanceClientIdParams(operationsUrl?: string | null): InstanceClientIdConfig & InstanceTypeConfig {
	const { instanceId, clusterId }: { instanceId?: string; clusterId?: string; } = useParams({ strict: false });
	const id = isLocalStudio ? OverallAppSignIn : instanceId ?? clusterId;
	if (!id) {
		throw new Error('id could not be automatically calculated in useInstanceClientIdParams');
	}
	return {
		instanceClient: getInstanceClient(id, operationsUrl),
		entityId: id,
		entityType: (isLocalStudio || instanceId) ? 'instance' : 'cluster',
	};
}
