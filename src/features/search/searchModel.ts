import { getOrganizationTargets } from '@/features/organizations/lib/organizationTargets';
import { getOrganizationClusterPermissions } from '@/hooks/usePermissions';
import type { Organization, User } from '@/integrations/api/api.patch';

export interface SearchTarget {
	key: string;
	name: string;
	kind: 'Organization' | 'Cluster';
	organizationName: string;
	organizationId: string;
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
				organizationId: target.id,
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
				organizationId: target.id,
				to: `/${target.id}/${cluster.id}`,
			})),
		];
	});
}

export function filterSearchTargets(targets: readonly SearchTarget[], search: string, currentOrganizationId?: string) {
	const query = search.toLocaleLowerCase().trim().replace(/\s+/g, ' ');
	const terms = query.split(' ').filter(Boolean);
	return targets.flatMap(target => {
		const name = target.name.toLocaleLowerCase();
		const context = target.organizationName.toLocaleLowerCase();
		if (!terms.every(term => `${name} ${context}`.includes(term))) { return []; }
		const rank = !query
			? (target.kind === 'Organization' ? 0 : 1)
			: name === query
			? 0
			: name.startsWith(query)
			? 1
			: terms.every(term => name.split(/\s+/).some(word => word.startsWith(term)))
			? 2
			: terms.every(term => name.includes(term))
			? 3
			: 4;
		return [{ target, rank }];
	}).sort((a, b) =>
		a.rank - b.rank
		|| Number(b.target.organizationId === currentOrganizationId)
			- Number(a.target.organizationId === currentOrganizationId)
		|| Number(b.target.kind === 'Organization') - Number(a.target.kind === 'Organization')
		|| a.target.name.localeCompare(b.target.name)
		|| a.target.organizationName.localeCompare(b.target.organizationName)
		|| a.target.key.localeCompare(b.target.key)
	).map(item => item.target);
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
