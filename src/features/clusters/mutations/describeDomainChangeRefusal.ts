import { Cluster, SchemaOrganizationDomain } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';

export interface DomainChangeRefusal {
	message: string;
	/** Nothing on the page clears it: the cluster's own record needs fixing. */
	needsSupport: boolean;
}

// Central manager's `assertClusterMutable` refuses every `PUT /Cluster/{id}` while an instance is
// FAILED or in `TRANSITIONING_INSTANCE_STATES` (src/lib/sharedHelpers.js, src/constants/
// sharedConstants.js). Hand-kept and never wider than that list: a status missing here still reaches
// central manager, whose own refusal is then shown. Not `isRunning`, which passes UPDATED.
const settlingInstanceStatuses = new Set([
	'PROVISIONING',
	'PENDING_UPGRADE',
	'DRAINING',
	'UPDATING',
	'UPDATED',
	'CLONE_PENDING',
	'CLONE_READY',
	'CLONING',
	'UPDATING_HDB_NODES',
	'GENERATE_TOKEN',
	'TOKEN_GENERATED',
	'STOPPING',
	'STOPPED',
	'STARTING',
	'RESTARTING',
]);

export function describeClusterNotChangeable(cluster: Cluster): DomainChangeRefusal | undefined {
	if (cluster.status !== 'RUNNING') {
		return {
			message: `This cluster is ${cluster.status ?? 'not running'}. Its domains can change once it is running again.`,
			needsSupport: false,
		};
	}
	for (const instance of cluster.instances ?? []) {
		const name = instance.instanceFqdn || instance.id;
		if (instance.status === 'FAILED') {
			return {
				message: `Instance ${name} has failed, and this cluster's domains can't change until it is recovered.`,
				needsSupport: true,
			};
		}
		if (instance.status && settlingInstanceStatuses.has(instance.status)) {
			return {
				message:
					`Instance ${name} is ${instance.status}. This cluster's domains can change once every instance is running.`,
				needsSupport: false,
			};
		}
	}
	return undefined;
}

function domainProblem(
	clusterId: string,
	domain: SchemaOrganizationDomain | undefined,
): string | undefined {
	if (!domain) {
		return "isn't one of this organization's domains";
	}
	if (domain.status !== 'ACTIVE') {
		return 'is not verified';
	}
	if (domain.clusterId && domain.clusterId !== clusterId) {
		return `is bound to cluster ${domain.clusterId}`;
	}
	return undefined;
}

/**
 * Checks every domain a change touches against central manager's per-domain refusals
 * (updateCluster.js), the ones the cluster already holds included: central manager rejects the
 * whole request over any one of them, and unbinds whatever the new list leaves out without checking
 * which cluster that domain is bound to.
 */
export function describeUnsendableDomainChange(
	cluster: Cluster,
	{ add, remove }: { add: string[]; remove: string | undefined },
	domains: SchemaOrganizationDomain[],
): DomainChangeRefusal | undefined {
	if (clusterIsSelfManaged(cluster)) {
		return { message: "Custom domains can't be bound to a self-managed cluster.", needsSupport: false };
	}
	const byId = new Map(domains.map((domain) => [domain.id, domain]));
	const held = cluster.domainIds ?? [];
	for (const id of held) {
		const problem = domainProblem(cluster.id, byId.get(id));
		if (problem) {
			return {
				message: `This cluster still lists ${byId.get(id)?.domain ?? id}, which ${problem}. `
					+ "Its domains can't change until that is cleared.",
				needsSupport: true,
			};
		}
	}
	for (const id of add) {
		const problem = held.includes(id) ? undefined : domainProblem(cluster.id, byId.get(id));
		if (problem) {
			return {
				message: `${byId.get(id)?.domain ?? id} ${problem}, so it can't be bound. The list has been refreshed.`,
				needsSupport: false,
			};
		}
	}
	if (remove && !held.includes(remove)) {
		const domain = byId.get(remove);
		return domain?.clusterId === cluster.id
			? {
				message:
					`${domain.domain} is bound to this cluster without the cluster listing it, so it can't be unbound here.`,
				needsSupport: true,
			}
			: {
				message: `${domain?.domain ?? remove} is no longer bound to this cluster. The list has been refreshed.`,
				needsSupport: false,
			};
	}
	return undefined;
}
