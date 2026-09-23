import { curryFilterByFuzzySearch } from '@/lib/string/filterByFuzzySearch';
import type { getOrganizationTargets } from './organizationTargets';

export type OrganizationTarget = ReturnType<typeof getOrganizationTargets>[number];
export type OrganizationAccess = 'all' | 'accessible' | 'locked';

export function summarizeOrganizations(targets: readonly OrganizationTarget[]) {
	const locked = targets.filter(target => target.locked).length;
	return { total: targets.length, accessible: targets.length - locked, locked };
}

export function selectOrganizations(
	targets: readonly OrganizationTarget[],
	search: string,
	access: OrganizationAccess,
	role: string,
	descending: boolean,
) {
	return targets.filter(curryFilterByFuzzySearch(['id', 'name'], search))
		.filter(target => access === 'all' || (access === 'locked' ? target.locked : !target.locked))
		.filter(target => !role || (!target.locked && target.roleName === role))
		.sort((a, b) => (a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) * (descending ? -1 : 1));
}
