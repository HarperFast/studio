import { isLocalStudio } from '@/config/constants';
import { getInstanceClient } from '@/config/getInstanceClient';
import { InstanceClientConfig, InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { OverallAppSignIn } from '@/features/auth/store/authStore';
import { useParams } from '@tanstack/react-router';
import { useMemo } from 'react';

interface UseParams {
	clusterId?: string;
	disableFabricConnect?: boolean;
	forceFabricConnect?: boolean;
	instanceId?: string;
	operationsUrl?: string | null;
	port?: number;
	secure?: boolean;
}

export function useInstanceClient(
	params: UseParams = {},
) {
	const { instanceId, clusterId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const id = isLocalStudio ? OverallAppSignIn : params.instanceId ?? instanceId ?? params.clusterId ?? clusterId;
	return getInstanceClient({ id, ...params });
}

export function useInstanceClientParams(
	params: UseParams = {},
): InstanceClientConfig & InstanceTypeConfig {
	const { instanceId, clusterId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const id = isLocalStudio ? OverallAppSignIn : params.instanceId ?? instanceId ?? params.clusterId ?? clusterId;
	return {
		instanceClient: getInstanceClient({ id, ...params }),
		entityType: (isLocalStudio || instanceId) ? 'instance' : 'cluster',
	};
}

export function useInstanceClientIdParams(
	params: UseParams = {},
): InstanceClientIdConfig & InstanceTypeConfig {
	const { instanceId, clusterId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	return useMemo(
		() => getInstanceClientIdFromParams({ instanceId, clusterId, ...params }),
		[
			params.instanceId ?? instanceId,
			params.clusterId ?? clusterId,
			params.operationsUrl,
			params.port,
			params.secure,
			params.disableFabricConnect,
			params.forceFabricConnect,
		],
	);
}

export function getInstanceClientIdFromParams({
	instanceId,
	clusterId,
	...params
}: UseParams): InstanceClientIdConfig & InstanceTypeConfig {
	const id = isLocalStudio ? OverallAppSignIn : instanceId ?? clusterId;
	if (!id) {
		throw new Error('id could not be automatically calculated in useInstanceClientIdParams');
	}
	return {
		instanceClient: getInstanceClient({ id, ...params }),
		entityId: id,
		entityType: (isLocalStudio || instanceId) ? 'instance' : 'cluster',
	};
}
