import { HarperVersion } from '@/features/clusters/queries/getHarperVersionsQuery';
import { compareVersions, wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';

/**
 * The version picker's options for an existing cluster: the highest version it runs as `current`, then
 * the offered versions it may move to. Global entries never go backwards and never duplicate a running
 * version; a `scoped` entry was released to this organization on purpose (usually an older pin), so it
 * is offered whatever its order, hidden only when it is `current`. The rules and why they differ are in
 * DESIGN.md → "Cluster upgrade picker".
 */
export function buildUpgradeVersionOptions(offered: HarperVersion[], clusterVersions: string[]): HarperVersion[] {
	const latest = [...clusterVersions].sort(compareVersions).pop();
	const running = new Set(clusterVersions);
	const options = offered.filter(v =>
		v.scoped
			? v.version !== latest
			: !running.has(v.version) && (!latest || wasAReleasedBeforeB(latest, v.version))
	);
	return latest ? [{ name: 'current', version: latest }, ...options] : options;
}
