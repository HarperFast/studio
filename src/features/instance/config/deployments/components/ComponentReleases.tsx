import { humanFileSize } from '@/lib/humanFileSize';
import { translateSecondsToAgo } from '@/lib/translateSecondsToAgo';
import { ReleaseCoverage, ReleasesSummary } from '../functions/releaseCoverage';
import { useComponentReleases } from '../hooks/useComponentReleases';
import { DeploymentLink } from './StagedReleaseNote';

// "Every node" only when every node answered: one that could not may hold anything.
function nodesText(nodes: readonly string[], summary: ReleasesSummary): string {
	return nodes.length === summary.nodes.length && summary.unreadable.length === 0 ? 'every node' : nodes.join(', ');
}

function describeCoverage(release: ReleaseCoverage, summary: ReleasesSummary): string {
	const alone = summary.nodes.length === 1 && summary.unreadable.length === 0;
	const parts: string[] = [];
	const add = (word: string, nodes: string[]) => {
		if (nodes.length > 0) {
			parts.push(alone ? word : `${word} on ${nodesText(nodes, summary)}`);
		}
	};
	add('live', release.live);
	add('kept', release.kept);
	add('staged', release.staged);
	if (!alone) {
		add('not', release.missing);
	}
	const text = parts.join(' · ');
	return text.charAt(0).toUpperCase() + text.slice(1);
}

const ago = (ms: number) => translateSecondsToAgo((Date.now() - ms) / 1000, ms);

/**
 * What each node holds of one component (HarperFast/studio#1786, item 4): the live release and each release it keeps,
 * which are what activating by id can make live. Harper 5.4.0-alpha.1+, from `list_releases`.
 */
export function ComponentReleasesPanel({ project }: { project: string }) {
	const { state } = useComponentReleases(project);

	if (state.kind === 'unsupported') {
		return null;
	}
	return (
		<section aria-label={`Releases of ${project}`} className="mb-4 rounded-md border border-border p-3 text-sm">
			<h2 className="mb-2 font-medium">
				Releases of {project} on each node
				{state.kind === 'checking' && state.previous && (
					<span className="ml-2 text-xs font-normal text-muted-foreground">Updating…</span>
				)}
			</h2>
			{state.kind === 'checking' && !state.previous && (
				<p className="text-muted-foreground">Asking each node what it holds…</p>
			)}
			{state.kind === 'checking' && state.previous && <ReleasesList summary={state.previous} />}
			{state.kind === 'unreadable' && (
				<p className="text-muted-foreground">Couldn&apos;t ask the nodes which releases they hold: {state.message}</p>
			)}
			{state.kind === 'ready' && <ReleasesList summary={state.summary} />}
		</section>
	);
}

function ReleasesList({ summary }: { summary: ReleasesSummary }) {
	return (
		<div className="flex flex-col gap-2">
			{summary.releases.length === 0 && summary.nodes.length > 0 && (
				<p className="text-muted-foreground">No node holds a release of it with an id.</p>
			)}
			{summary.releases.length > 0 && (
				<ul className="flex flex-col gap-1">
					{summary.releases.map((release) => (
						<li key={release.deploymentId} className="flex flex-wrap items-baseline gap-x-2">
							<DeploymentLink deployment={{ deployment_id: release.deploymentId }} />
							<span>{describeCoverage(release, summary)}</span>
							{(release.at !== undefined || release.size !== undefined) && (
								<span className="text-xs text-muted-foreground">
									{[
										release.at ? ago(release.at) : undefined,
										release.size !== undefined ? humanFileSize(release.size) : undefined,
									].filter(Boolean).join(' · ')}
								</span>
							)}
						</li>
					))}
				</ul>
			)}
			{summary.unrecordedLive.length > 0 && (
				<p className="text-muted-foreground">
					Live on{' '}
					{nodesText(summary.unrecordedLive, summary)}: a release with no id, made live before Harper 5.3, or none.
				</p>
			)}
			{summary.unreadable.map(({ node, error }) => (
				<p key={node} className="text-destructive">{node} couldn&apos;t say what it holds: {error}</p>
			))}
			<p className="text-xs text-muted-foreground">
				Open a release to activate it or go back to it. Each node keeps up to deployment.stagingRetention.maxCount (5 by
				default) staged and kept releases together; a release made live before Harper 5.3, or deployed from a local
				directory, isn&apos;t kept. A release replaced before the node ran Harper 5.4 shows as staged.
			</p>
		</div>
	);
}
