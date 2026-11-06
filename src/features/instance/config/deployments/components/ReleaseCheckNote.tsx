import { Deployment } from '@/integrations/api/instance/deployments/types';
import { MissingReason, missingReason } from '../functions/releaseCoverage';
import { type ReleaseCheck, useRetryReleases } from '../hooks/useComponentReleases';

const MISSING_REASON: Record<MissingReason, string> = {
	'failed-there': 'this deploy failed there',
	'local-directory': 'it was deployed from a local directory, which no node keeps',
	'not-kept':
		"it isn't kept there: it was made live before Harper 5.3, retention pruned it (deployment.stagingRetention.maxCount keeps 5 releases by default, staged and kept together), or the node joined the cluster later",
};

const list = (nodes: readonly string[]) => nodes.join(', ');

/** `record`: the deployment that built the release, the only thing that can say why a node has none. */
export function ReleaseCheckNote({
	check,
	record,
	showLive = true,
}: {
	check: ReleaseCheck;
	record?: Deployment;
	showLive?: boolean;
}) {
	const retry = useRetryReleases();
	switch (check.kind) {
		case 'unsupported':
			return null;
		case 'checking':
			return <p className="text-sm text-muted-foreground">Checking which nodes hold this release…</p>;
		case 'unreadable':
			return (
				<p className="text-sm text-muted-foreground">
					Couldn&apos;t ask the nodes which releases they hold: {check.message}{' '}
					Activating it needs every node to say it holds it.{' '}
					<button
						type="button"
						className="underline"
						onClick={() => void retry()}
					>
						Try again
					</button>
				</p>
			);
		case 'live-everywhere':
			return showLive ? <p className="text-sm text-muted-foreground">Live on every node.</p> : null;
		case 'available':
			return (
				<p className="text-sm text-muted-foreground">
					{check.liveOn.length > 0
						? `Live on ${list(check.liveOn)}. The other nodes hold it, so activating it again makes it live there too.`
						: 'Every node holds this release, so activating it just switches each one to it.'}
				</p>
			);
		case 'missing': {
			if (check.missing.length === 0 && check.unreadable.length === 0) {
				return <p className="text-sm text-muted-foreground">No node said which releases it holds.</p>;
			}
			const byReason = new Map<MissingReason, string[]>();
			for (const node of check.missing) {
				const reason = missingReason(node, record);
				byReason.set(reason, [...(byReason.get(reason) ?? []), node]);
			}
			return (
				<div className="flex flex-col gap-1 text-sm text-muted-foreground">
					<p>
						{check.liveOn.length > 0 && `Live on ${list(check.liveOn)}. `}Activating it needs every node to hold it, and
						{check.missing.length > 0 ? ' some do not:' : " some couldn't say:"}
					</p>
					<ul className="list-disc pl-5">
						{[...byReason].map(([reason, nodes]) => (
							<li key={reason}>
								{list(nodes)}: {MISSING_REASON[reason]}.
							</li>
						))}
						{check.unreadable.map(({ node, error }) => (
							<li key={`unreadable-${node}`}>
								{node} couldn&apos;t say which releases it holds: {error}
							</li>
						))}
					</ul>
				</div>
			);
		}
	}
}
