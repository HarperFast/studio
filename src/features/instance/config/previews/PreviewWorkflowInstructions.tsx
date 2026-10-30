import { Button } from '@/components/ui/button';
import { useCopyTextToClipboard } from '@/hooks/useCopyToClipboard';
import { PreviewPolicy } from '@/integrations/api/instance/previews/previews';
import { CopyIcon } from 'lucide-react';
import { defaultPreviewDomain } from './previewAudience';
import {
	PREVIEW_CLEANUP_ENVIRONMENT,
	PREVIEW_ENVIRONMENT,
	PREVIEW_TARGET_VARIABLE,
	PREVIEW_WORKFLOW_PATH,
	previewWorkflowText,
} from './starterPreviewWorkflow';

/** The rest of the setup, in the repository. Built from what the cluster holds, so it reads the same on every visit. */
export function PreviewWorkflowInstructions(
	{ policy, credentialSealed }: { policy: PreviewPolicy; credentialSealed: boolean },
) {
	const copy = useCopyTextToClipboard();
	const { app, branch, audience, repository } = policy;
	if (!branch || !audience) {
		return null;
	}
	const constraints = policy.grant?.constraints;
	const domain = constraints?.hostSuffix?.replace(/^\./, '');
	const workflow = previewWorkflowText({
		app,
		branch,
		environment: policy.environment,
		domain: domain === defaultPreviewDomain(audience) ? undefined : domain,
		credential: credentialSealed,
		shared: constraints?.branchedDatabases !== 'required',
	});
	const workflowPath = policy.workflow ?? PREVIEW_WORKFLOW_PATH;
	const environment = policy.environment ?? PREVIEW_ENVIRONMENT;
	const cleanupEnvironment = policy.cleanupEnvironment ?? PREVIEW_CLEANUP_ENVIRONMENT;

	return (
		<section className="flex flex-col gap-3 rounded-md border p-4 text-sm" aria-label="What to commit">
			<h3 className="font-semibold">What to commit</h3>
			<ol className="flex list-decimal flex-col gap-3 pl-4">
				<li>
					<p>
						Commit this file to <code className="font-mono">{branch}</code> as{' '}
						<code className="font-mono">{workflowPath}</code>. Pull requests run it from that branch, so a pull request
						can't change it.
					</p>
					<div className="relative mt-2">
						<Button
							className="absolute top-2 right-2"
							size="sm"
							variant="defaultOutline"
							onClick={() => copy(workflow)}
						>
							<CopyIcon />
							<span className="sr-only">Copy workflow</span>
						</Button>
						<pre className="max-h-96 overflow-auto rounded-md border bg-muted/50 p-3 text-xs leading-relaxed">
							<code>{workflow}</code>
						</pre>
					</div>
				</li>
				<li>
					<p>
						Add a repository variable named <code className="font-mono">{PREVIEW_TARGET_VARIABLE}</code> with this value
						{repository && (
							<>
								{' '}
								(<a
									className="underline"
									href={`https://github.com/${repository}/settings/variables/actions`}
									target="_blank"
									rel="noreferrer"
								>
									Actions variables
								</a>)
							</>
						)}
						:
					</p>
					<div className="mt-2 flex items-center gap-2">
						<code className="break-all font-mono">{audience}</code>
						<Button size="sm" variant="defaultOutline" onClick={() => copy(audience)}>
							<CopyIcon />
							<span className="sr-only">Copy {PREVIEW_TARGET_VARIABLE}</span>
						</Button>
					</div>
				</li>
				<li>
					Create two environments, <code className="font-mono">{environment}</code> and{' '}
					<code className="font-mono">{cleanupEnvironment}</code>
					{repository && (
						<>
							{' '}
							(<a
								className="underline"
								href={`https://github.com/${repository}/settings/environments`}
								target="_blank"
								rel="noreferrer"
							>
								Environments
							</a>)
						</>
					)}
					. Required reviewers on {environment} make someone approve each deploy. Leave {cleanupEnvironment}{' '}
					without them, so closing a pull request never waits for an approval.
				</li>
			</ol>
			<p className="text-muted-foreground">
				From 2026-11-02, GitHub's default execution protection blocks pull_request_target for affected public
				repositories, so the repository's Actions policy has to allow it for this workflow.
			</p>
		</section>
	);
}
