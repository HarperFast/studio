import { getOrganizationTargets } from '@/features/organizations/lib/organizationTargets';
import { getOrganizationClusterPermissions } from '@/hooks/usePermissions';
import type { Organization, User } from '@/integrations/api/api.patch';

export interface SearchTarget {
	key: string;
	name: string;
	kind: 'Organization' | 'Cluster' | 'Page';
	hierarchy?: string;
	organizationName: string;
	organizationId: string;
	to: string;
	searchName: string;
	searchText: string;
	searchWords: string[];
}

type UnindexedTarget = Omit<SearchTarget, 'searchName' | 'searchText' | 'searchWords'>;

export interface SearchPage {
	name: string;
	to: string;
	hierarchy: string;
	keywords?: readonly string[];
}

function indexTarget(target: UnindexedTarget, keywords: readonly string[] = []): SearchTarget {
	const searchName = target.name.toLocaleLowerCase();
	return {
		...target,
		searchName,
		searchText: [target.name, target.organizationName, target.hierarchy, ...keywords].join(' ').toLocaleLowerCase(),
		searchWords: searchName.split(/\s+/),
	};
}

export function buildPageSearchTargets(pages: readonly SearchPage[], organizationId: string): SearchTarget[] {
	return pages.map(({ name, to, hierarchy, keywords }) =>
		indexTarget(
			{ key: `page:${to}`, name, to, hierarchy, kind: 'Page', organizationId, organizationName: '' },
			keywords,
		)
	);
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
	}).map(target => indexTarget(target));
}

export function filterSearchTargets(targets: readonly SearchTarget[], search: string, currentOrganizationId?: string) {
	const query = search.toLocaleLowerCase().trim().replace(/\s+/g, ' ');
	const terms = query.split(' ').filter(Boolean);
	return targets.flatMap(target => {
		const name = target.searchName;
		if (!terms.every(term => target.searchText.includes(term))) { return []; }
		const rank = !query
			? (target.kind === 'Page' ? 0 : target.kind === 'Organization' ? 1 : 2)
			: name === query
			? 0
			: name.startsWith(query)
			? 1
			: terms.every(term => target.searchWords.some(word => word.startsWith(term)))
			? 2
			: terms.every(term => name.includes(term))
			? 3
			: 4;
		return [{ target, rank }];
	}).sort((a, b) =>
		a.rank - b.rank
		|| Number(b.target.kind === 'Page') - Number(a.target.kind === 'Page')
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
