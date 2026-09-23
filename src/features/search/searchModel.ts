import { getOrganizationTargets } from '@/features/organizations/lib/organizationTargets';
import { getOrganizationClusterPermissions } from '@/hooks/usePermissions';
import type { Organization, User } from '@/integrations/api/api.patch';

export interface SearchTarget {
	key: string;
	name: string;
	kind: 'Organization' | 'Cluster';
	organizationName: string;
	to: string;
}

export function buildSearchTargets(user: User, organizations: ReadonlyMap<string, Organization>): SearchTarget[] {
	return getOrganizationTargets(user).filter(target => !target.locked).flatMap(target => {
		const organization = organizations.get(target.id);
		return [
			{
				key: `org:${target.id}`,
				name: target.name,
				kind: 'Organization' as const,
				organizationName: target.name,
				to: `/${target.id}`,
			},
			...(organization?.clusters ?? []).filter(cluster =>
				cluster.status !== 'TERMINATED' && cluster.status !== 'REMOVED'
				&& getOrganizationClusterPermissions(user, target.id, cluster.id).view
			).map(cluster => ({
				key: `cluster:${target.id}:${cluster.id}`,
				name: cluster.name || cluster.id,
				kind: 'Cluster' as const,
				organizationName: target.name,
				to: `/${target.id}/${cluster.id}`,
			})),
		];
	});
}

export function filterSearchTargets(targets: readonly SearchTarget[], search: string) {
	const terms = search.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
	return targets.filter(target =>
		terms.every(term => `${target.name} ${target.organizationName}`.toLocaleLowerCase().includes(term))
	)
		.sort((a, b) =>
			a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)
			|| a.organizationName.localeCompare(b.organizationName) || a.key.localeCompare(b.key)
		);
}

export async function loadSearchOrganizations(
	ids: readonly string[],
	load: (id: string) => Promise<Organization>,
	onResult: (id: string, organization: Organization | null) => void,
	isCancelled: () => boolean,
) {
	let next = 0;
	await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
		while (!isCancelled() && next < ids.length) {
			const id = ids[next++];
			let organization: Organization | null = null;
			try {
				organization = await load(id);
			} catch { /* QueryCache reports errors; the palette presents partial results. */ }
			if (!isCancelled()) { onResult(id, organization); }
		}
	}));
}
