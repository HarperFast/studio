import { isLocalStudio } from '@/config/constants';
import { getInstanceClient } from '@/config/getInstanceClient';
import { InstanceClientConfig, InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { OverallAppSignIn } from '@/features/auth/store/authStore';
import { useParams } from '@tanstack/react-router';

export function useInstanceClient(operationsUrl?: string | null, port?: number, secure?: boolean) {
	const { instanceId, clusterId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const id = isLocalStudio ? OverallAppSignIn : instanceId ?? clusterId;
	return getInstanceClient({ id, operationsUrl, port, secure });
}

export function useInstanceClientParams(
	operationsUrl?: string | null,
	port?: number,
	secure?: boolean,
): InstanceClientConfig & InstanceTypeConfig {
	const { instanceId, clusterId }: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	const id = isLocalStudio ? OverallAppSignIn : instanceId ?? clusterId;
	return {
		instanceClient: getInstanceClient({ id, operationsUrl, port, secure }),
		entityType: (isLocalStudio || instanceId) ? 'instance' : 'cluster',
	};
}

export function useInstanceClientIdParams(
	operationsUrl?: string | null,
	port?: number,
	secure?: boolean,
): InstanceClientIdConfig & InstanceTypeConfig {
	const params: { instanceId?: string; clusterId?: string } = useParams({ strict: false });
	return getInstanceClientIdFromParams({ ...params, operationsUrl, port, secure });
}

export function getInstanceClientIdFromParams({
	instanceId,
	clusterId,
	operationsUrl,
	port,
	secure,
}: {
	instanceId?: string;
	clusterId?: string;
	operationsUrl?: string | null;
	port?: number;
	secure?: boolean;
}): InstanceClientIdConfig & InstanceTypeConfig {
	const id = isLocalStudio ? OverallAppSignIn : instanceId ?? clusterId;
	if (!id) {
		throw new Error('id could not be automatically calculated in useInstanceClientIdParams');
	}
	return {
		instanceClient: getInstanceClient({ id, operationsUrl, port, secure }),
		entityId: id,
		entityType: (isLocalStudio || instanceId) ? 'instance' : 'cluster',
	};
}
