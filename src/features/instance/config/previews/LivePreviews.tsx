import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { APIDirectoryEntry } from '@/integrations/api/instance/applications/getComponents';
import {
	LivePreview,
	livePreviewsOf,
	previewExpiresAtMs,
	useDropPreview,
} from '@/integrations/api/instance/previews/previews';
import { isReplicatedResponseFailure, ReplicatedResponse, replicationFailed } from '@/integrations/api/replication';
import { OUTCOME_UNKNOWN_TITLE } from '@/integrations/api/unansweredWrite';
import { parseGitHubRepository } from '@/integrations/github/lookUpGitHubRepository';
import { describeError, shouldToastOwnFailure } from '@/react-query/queryClient';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const COMMIT_LENGTH = 12;

type DropOutcome =
	| { project: string; response: ReplicatedResponse }
	| { project: string; failure: string; unanswered: boolean };

function dropResultTitle(outcome: DropOutcome): string {
	if ('failure' in outcome && outcome.unanswered) {
		return OUTCOME_UNKNOWN_TITLE;
	}
	return 'failure' in outcome || replicationFailed(outcome.response)
		? `${outcome.project} was not fully dropped`
		: `Dropped ${outcome.project}`;
}

function DropResult({ outcome, onDismiss }: { outcome: DropOutcome; onDismiss: () => void }) {
	const peers = 'response' in outcome ? outcome.response.replicated ?? [] : [];
	const failed = 'failure' in outcome || peers.some(isReplicatedResponseFailure);
	return (
		<Alert variant={failed ? 'destructive' : 'default'}>
			<AlertTitle>{dropResultTitle(outcome)}</AlertTitle>
			<AlertDescription>
				{'failure' in outcome
					? <p className="whitespace-pre-wrap">{outcome.failure}</p>
					: (
						<ul className="list-disc pl-4">
							<li>{outcome.response.message}</li>
							{peers.map((peer) => (
								<li key={peer.node}>
									{peer.node}: {isReplicatedResponseFailure(peer) ? `failed: ${peer.reason}` : String(peer.message)}
								</li>
							))}
						</ul>
					)}
				<Button className="mt-2" size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>
			</AlertDescription>
		</Alert>
	);
}

function PreviewRow({ live, disabled, onDelete }: { live: LivePreview; disabled: boolean; onDelete: () => void }) {
	const { project, host, preview } = live;
	const repository = preview.repository && parseGitHubRepository(preview.repository);
	const commit = preview.sha?.slice(0, COMMIT_LENGTH);
	const expires = previewExpiresAtMs(preview);
	const url = host ? `https://${host}/` : undefined;
	return (
		<TableRow>
			<TableCell>
				{repository
					? (
						<a
							className="underline"
							href={`https://github.com/${repository}/pull/${preview.pr}`}
							target="_blank"
							rel="noreferrer"
						>
							#{preview.pr}
						</a>
					)
					: `#${preview.pr}`}
			</TableCell>
			<TableCell className="break-all">{preview.branch ?? '—'}</TableCell>
			<TableCell className="font-mono text-xs">
				{repository && commit
					? (
						<a
							className="underline"
							href={`https://github.com/${repository}/commit/${preview.sha}`}
							target="_blank"
							rel="noreferrer"
						>
							{commit}
						</a>
					)
					: commit ?? '—'}
			</TableCell>
			<TableCell className="break-all">
				{url ? <a className="underline" href={url} target="_blank" rel="noreferrer">{url}</a> : '—'}
			</TableCell>
			<TableCell>{expires === undefined ? '—' : new Date(expires).toLocaleString()}</TableCell>
			<TableCell className="text-right">
				<Button size="sm" variant="destructiveOutline" disabled={disabled} onClick={onDelete}>
					<TrashIcon />
					<span className="sr-only">Delete {project}</span>
				</Button>
			</TableCell>
		</TableRow>
	);
}

export function LivePreviews(
	{ app, tree, previewsOn }: { app: string; tree: APIDirectoryEntry | undefined; previewsOn: boolean },
) {
	const { instanceClient, entityId } = useInstanceClientIdParams();
	// Also from one instance's page: a preview is on every node of the cluster, and a local drop would leave it on the rest.
	const { clusterId }: { clusterId?: string } = useParams({ strict: false });
	const queryClient = useQueryClient();
	const { mutateAsync: dropPreview, isPending } = useDropPreview();
	const [target, setTarget] = useState<string>();
	const [outcome, setOutcome] = useState<DropOutcome>();
	const previews = livePreviewsOf(tree, app);

	const onDeleteConfirmed = async () => {
		const project = target;
		if (!project) {
			return;
		}
		setOutcome(undefined);
		try {
			const response = await dropPreview({ instanceClient, project, replicated: !!clusterId });
			setOutcome({ project, response });
			if (!replicationFailed(response)) {
				toast.success(`Dropped ${project}`);
			}
		} catch (error) {
			setOutcome({ project, failure: describeError(error).message, unanswered: !shouldToastOwnFailure(error) });
		} finally {
			setTarget(undefined);
			await queryClient.invalidateQueries({ queryKey: [entityId, 'get_components'] });
		}
	};

	if (previews.length === 0 && !previewsOn && !outcome) {
		return null;
	}

	return (
		<section className="flex flex-col gap-2 rounded-md border p-4" aria-label="Live previews">
			<h3 className="text-sm font-semibold">Live previews</h3>
			{outcome && <DropResult outcome={outcome} onDismiss={() => setOutcome(undefined)} />}
			{previews.length === 0
				? previewsOn && (
					<p className="text-sm text-muted-foreground">None yet. The next pull request appears here once it deploys.</p>
				)
				: (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>PR</TableHead>
								<TableHead>Branch</TableHead>
								<TableHead>Commit</TableHead>
								<TableHead>URL</TableHead>
								<TableHead>Expires</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{previews.map((live) => (
								<PreviewRow
									key={live.project}
									live={live}
									disabled={isPending}
									onDelete={() => setTarget(live.project)}
								/>
							))}
						</TableBody>
					</Table>
				)}
			<ConfirmDeletionModal
				typeOfThingBeingDeleted={`preview '${target ?? ''}'`}
				isModalOpen={target !== undefined}
				setIsModalOpen={(open) => !open && setTarget(undefined)}
				deletionConfirmed={() => void onDeleteConfirmed()}
				deletionPending={isPending}
				hideDataLossWarning
				transitiveVerb="Drop"
				presentParticiple="Dropping"
			/>
		</section>
	);
}
