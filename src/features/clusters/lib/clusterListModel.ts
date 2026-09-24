import { isBeingUpdated, isPendingUpdate } from '@/components/ui/utils/badgeStatus';
import { activeClusterStatuses, deletedClusterStatuses } from '@/config/clusterStatuses';
import { detectPartialUpgrade } from '@/features/clusters/upsert/lib/detectPartialUpgrade';
import type { Cluster } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { capitalizeWords } from '@/lib/string/capitalizeWords';

export type ClusterCategory = 'running' | 'attention' | 'failed' | 'other';
export type ClusterSort = 'attention' | 'name' | 'newest';
export interface ClusterListControls {
	search: string;
	category: ClusterCategory | 'all';
	region: string;
	sort: ClusterSort;
}

export const defaultClusterListControls: ClusterListControls = {
	search: '',
	category: 'all',
	region: '',
	sort: 'attention',
};

export function describeCluster(cluster: Cluster, regionNames?: ReadonlyMap<string, string>) {
	const selfHosted = clusterIsSelfManaged(cluster);
	const instances = cluster.instances?.filter(instance => !deletedClusterStatuses.includes(instance.status ?? ''));
	const planRegions = (cluster.plans ?? []).map(plan => plan.region || regionNames?.get(plan.regionId ?? '')).filter(
		Boolean,
	);
	const regionValues = [
		...planRegions,
		...(instances ?? []).map(instance => instance.region || regionNames?.get(instance.regionId ?? '')),
	];
	const regions = [...new Set(regionValues.filter((region): region is string => !!region))].sort();
	const versions = [...new Set((instances ?? []).map(instance => instance.version).filter(Boolean))].sort();
	const status = cluster.status;
	const failed = status === 'FAILED' || status === 'ERROR'
		|| (!selfHosted && instances?.some(instance => instance.status === 'FAILED' || instance.status === 'ERROR'));
	const pendingUpgrade = status === 'PENDING_UPGRADE'
		|| (!selfHosted && instances?.some(instance => instance.status === 'PENDING_UPGRADE'));
	const partialUpgrade = !selfHosted && instances ? detectPartialUpgrade(instances) : null;
	const updating = isBeingUpdated(status) || isPendingUpdate(status)
		|| ['STARTING', 'STOPPING', 'RESTARTING'].includes(status ?? '');
	const notices: string[] = [];
	if (failed) { notices.push('Failure reported'); }
	if (pendingUpgrade) { notices.push('Upgrade pending'); }
	if (partialUpgrade) {
		notices.push(
			`${partialUpgrade.behindCount} ${
				partialUpgrade.behindCount === 1 ? 'instance' : 'instances'
			} on an older version`,
		);
	}
	if (status === 'PARTIAL') { notices.push('Some instances are not running'); }
	if (status === 'UPDATED') { notices.push('Waiting for running status'); }
	if (status === 'STOPPED') { notices.push('Cluster stopped'); }
	if (cluster.resetPassword) { notices.push('Setup required'); }
	if (updating && !pendingUpgrade) { notices.push(capitalizeWords(status!)); }
	const category: ClusterCategory = failed
		? 'failed'
		: notices.length
		? 'attention'
		: activeClusterStatuses.includes(status ?? '')
		? 'running'
		: 'other';
	const date = Date.parse(cluster.createdAt ?? '');
	return {
		cluster,
		category,
		label: failed && status !== 'FAILED' && status !== 'ERROR'
			? 'Instance failure'
			: status
			? capitalizeWords(status)
			: 'Status unknown',
		notices,
		regions,
		instanceCount: instances?.length,
		version: versions.length > 1 ? 'Mixed versions' : versions[0],
		hosting: selfHosted ? 'Self-hosted' : cluster.plans?.length ? 'Harper Cloud' : 'Hosting unknown',
		createdAt: Number.isFinite(date) ? date : Number.NEGATIVE_INFINITY,
		searchText: [
			cluster.name,
			cluster.id,
			cluster.fqdn,
			...(cluster.domains ?? []).map(domain => domain.domain),
			...regions,
		]
			.filter(Boolean).join(' ').toLowerCase(),
	};
}

export type ClusterListItem = ReturnType<typeof describeCluster>;

export function buildClusterList(clusters: readonly Cluster[], regionNames?: ReadonlyMap<string, string>) {
	const items = clusters.filter(cluster => cluster.status !== 'TERMINATED' && cluster.status !== 'REMOVED')
		.map(cluster => describeCluster(cluster, regionNames));
	const counts: Record<ClusterCategory, number> = { running: 0, attention: 0, failed: 0, other: 0 };
	for (const item of items) { counts[item.category]++; }
	return { items, counts, regions: [...new Set(items.flatMap(item => item.regions))].sort() };
}

const categoryPriority: Record<ClusterCategory, number> = { failed: 0, attention: 1, other: 2, running: 3 };

export function selectClusters(items: readonly ClusterListItem[], controls: ClusterListControls) {
	const search = controls.search.trim().toLowerCase();
	return items.filter(item =>
		(controls.category === 'all' || item.category === controls.category)
		&& (!controls.region || item.regions.includes(controls.region))
		&& (!search || item.searchText.includes(search))
	).sort((a, b) => {
		if (controls.sort === 'attention' && a.category !== b.category) {
			return categoryPriority[a.category] - categoryPriority[b.category];
		}
		if (controls.sort === 'newest' && a.createdAt !== b.createdAt) {
			return a.createdAt > b.createdAt ? -1 : 1;
		}
		return a.cluster.name.localeCompare(b.cluster.name) || a.cluster.id.localeCompare(b.cluster.id);
	});
}
