import { Button } from '@/components/ui/button';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useCopyTextToClipboard } from '@/hooks/useCopyToClipboard';
import { PreviewPolicy } from '@/integrations/api/instance/previews/previews';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { parseGitHubRepository } from '@/integrations/github/lookUpGitHubRepository';
import { useQuery } from '@tanstack/react-query';
import { CopyIcon } from 'lucide-react';
import { defaultPreviewDomain } from './previewAudience';
import {
	PREVIEW_CLEANUP_ENVIRONMENT,
	PREVIEW_ENVIRONMENT,
	PREVIEW_TARGET_VARIABLE,
	PREVIEW_WORKFLOW_PATH,
	previewWorkflowText,
} from './starterPreviewWorkflow';

const GITHUB_RULE_URL =
	'https://github.blog/changelog/2026-09-17-workflow-execution-protections-in-github-actions-generally-available/';

/** Built from what the cluster holds rather than the form, so it reads the same on every visit. */
export function PreviewWorkflowInstructions(
	{ policy, credentialSealed }: { policy: PreviewPolicy; credentialSealed: boolean },
) {
	const copy = useCopyTextToClipboard();
	const { data: registrationInfo } = useQuery(getRegistrationInfoQueryOptions(useInstanceClientIdParams()));
	const { app, branch, audience } = policy;
	const repository = policy.repository && parseGitHubRepository(policy.repository);
	if (!branch || !audience) {
		return null;
	}
	const constraints = policy.grant?.constraints;
	const domain = constraints?.hostSuffix?.replace(/^\./, '');
	const workflow = previewWorkflowText({
		app,
		branch,
		environment: policy.environment,
		cleanupEnvironment: policy.cleanupEnvironment,
		domain: domain === defaultPreviewDomain(audience) ? undefined : domain,
		credential: credentialSealed,
		shared: constraints?.branchedDatabases !== 'required',
	});
	const workflowPath = policy.workflow ?? PREVIEW_WORKFLOW_PATH;
	const environment = policy.environment ?? PREVIEW_ENVIRONMENT;
	const cleanupEnvironment = policy.cleanupEnvironment ?? PREVIEW_CLEANUP_ENVIRONMENT;
	const version = registrationInfo?.version;

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
			{version?.includes('-') && (
				<p>
					This cluster runs {version}, a prerelease, and <code className="font-mono">harper@^5.4</code>{' '}
					matches only a release. Until 5.4.0 is published, change both install lines to{' '}
					<code className="font-mono">harper@{version}</code>.
				</p>
			)}
			<p className="text-muted-foreground">
				On a public repository, GitHub's default rule blocks pull_request_target from 2026-12-02, so its Actions policy
				has to allow this workflow.{' '}
				<a className="underline" href={GITHUB_RULE_URL} target="_blank" rel="noreferrer">GitHub's announcement</a>
			</p>
		</section>
	);
}
