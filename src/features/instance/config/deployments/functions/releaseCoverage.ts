import { ListReleasesResponse } from '@/integrations/api/instance/deployments/listReleases';
import { Deployment } from '@/integrations/api/instance/deployments/types';

/** Where one release is, by node name. A node in none of the lists could not be asked. */
export interface ReleaseCoverage {
	deploymentId: string;
	live: string[];
	kept: string[];
	staged: string[];
	/** Answered, and holds it in none of the three ways. */
	missing: string[];
	/** The newest time a node reports for it, when one keeps it. */
	at?: number;
	size?: number;
}

export interface ReleasesSummary {
	/** Every node that answered for the component, in the order Harper listed them. */
	nodes: string[];
	unreadable: { node: string; error: string }[];
	/** Nodes running a release whose tree names no id: one made live before Harper 5.3.0. */
	unrecordedLive: string[];
	/** The live ones first, then newest first. */
	releases: ReleaseCoverage[];
}

export function summarizeReleases(response: ListReleasesResponse, project: string): ReleasesSummary {
	const summary: ReleasesSummary = { nodes: [], unreadable: [], unrecordedLive: [], releases: [] };
	const byId = new Map<string, ReleaseCoverage>();
	const coverage = (deploymentId: string) => {
		let found = byId.get(deploymentId);
		if (!found) {
			found = { deploymentId, live: [], kept: [], staged: [], missing: [] };
			byId.set(deploymentId, found);
		}
		return found;
	};
	for (const answer of response.nodes) {
		if (answer.error || !Array.isArray(answer.components)) {
			summary.unreadable.push({ node: answer.node, error: answer.error || 'it answered without its releases' });
			continue;
		}
		summary.nodes.push(answer.node);
		const component = answer.components.find((entry) => entry.project === project);
		if (component?.deployment_id) {
			coverage(component.deployment_id).live.push(answer.node);
		} else {
			summary.unrecordedLive.push(answer.node);
		}
		for (const release of component?.releases ?? []) {
			const found = coverage(release.deployment_id);
			found[release.state === 'kept' ? 'kept' : 'staged'].push(answer.node);
			found.at = Math.max(found.at ?? 0, release.at);
			found.size = Math.max(found.size ?? 0, release.size);
		}
	}
	for (const found of byId.values()) {
		found.missing = summary.nodes.filter((node) =>
			!found.live.includes(node) && !found.kept.includes(node) && !found.staged.includes(node)
		);
	}
	summary.releases = [...byId.values()].sort((a, b) =>
		Number(b.live.length > 0) - Number(a.live.length > 0) || (b.at ?? 0) - (a.at ?? 0)
	);
	return summary;
}

/**
 * Whether activating `deploymentId` can reach every node. A node that holds it live, kept or staged takes it (the
 * live one with no swap: harper `v5.4.0-beta.2:components/Application.ts:5168`); any other answers 404 and the
 * activation ends `partial`. A node that could not answer leaves it unknown, which counts as missing.
 */
export type ReleaseAvailability =
	| { kind: 'live-everywhere' }
	| { kind: 'available'; liveOn: string[] }
	| {
		kind: 'missing';
		liveOn: string[];
		missing: string[];
		unreadable: ReleasesSummary['unreadable'];
		/** Some node that answered holds it, live, kept or staged. */
		held: boolean;
	};

export function releaseAvailability(summary: ReleasesSummary, deploymentId: string): ReleaseAvailability {
	const found = summary.releases.find((release) => release.deploymentId === deploymentId);
	const missing = found ? found.missing : summary.nodes;
	const liveOn = found?.live ?? [];
	if (missing.length > 0 || summary.unreadable.length > 0 || summary.nodes.length === 0) {
		return { kind: 'missing', liveOn, missing, unreadable: summary.unreadable, held: found !== undefined };
	}
	return liveOn.length === summary.nodes.length ? { kind: 'live-everywhere' } : { kind: 'available', liveOn };
}

/**
 * Why a node holds no copy of a release, as far as the record that built it can tell: the deploy failed there; it
 * came from a local directory, which no node keeps; or it failed before recording that node, which starts with no
 * `peer_results` (harper `v5.4.0-beta.2:components/deploymentRecorder.ts:162`), so it may never have got there.
 * Otherwise it is one of the causes the record cannot tell apart: made live before Harper 5.3.0, which kept nothing;
 * pruned beyond `deployment.stagingRetention.maxCount` (harper docs, "Going back to a previous release"); or a node
 * that was not in the cluster then. The record cannot name the nodes it reached: `origin_node` is the receiving node's
 * host name, not its node name. Without the record, nothing is known of why.
 */
export type MissingReason = 'failed-there' | 'local-directory' | 'not-reached' | 'not-kept' | 'unknown';

export function missingReason(node: string, record: Deployment | undefined): MissingReason {
	if (!record) {
		return 'unknown';
	}
	const recorded = record.peer_results?.filter((peer) => peer.node === node) ?? [];
	if (recorded.some((peer) => peer.status === 'failed')) {
		return 'failed-there';
	}
	if (record.package_identifier?.startsWith('file:')) {
		return 'local-directory';
	}
	return record.status === 'failed' && recorded.length === 0 ? 'not-reached' : 'not-kept';
}

export function releasedId(record: Deployment): string {
	return record.activated_from || record.deployment_id;
}
