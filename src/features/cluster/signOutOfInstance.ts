import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { authStore } from '@/features/auth/store/authStore';
import { Instance } from '@/integrations/api/api.patch';
import { onInstanceLogoutSubmit } from '@/integrations/api/instance/auth/onInstanceLogoutSubmit';

/**
 * Signs out of a single instance, and flags its cluster as signed out locally — but leaves
 * sibling instances alone. The instance-level `logout` invalidates the session on that node,
 * and the cluster FQDN load-balances across nodes, so a cluster connection left flagged as
 * signed in would hit a "Must login" error whenever the balancer routes it to the node we just
 * logged out of (#1320). Sibling instances hold their own sessions and stay signed in.
 */
export async function signOutOfInstance(
	{ instance, instanceClient }: InstanceClientConfig & { instance: Instance },
): Promise<void> {
	await onInstanceLogoutSubmit({ instanceClient, entityId: instance.id });
	authStore.setUserForEntity(instance, null);
	if (instance.clusterId) {
		authStore.signOutLocally(instance.clusterId);
	}
}
