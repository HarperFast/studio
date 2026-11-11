import { CopyableBlock, CopyableValue } from '@/features/instance/config/githubActions/CopyableText';
import { PreviewPolicy } from '@/integrations/api/instance/previews/previews';
import { parseGitHubRepository } from '@/integrations/github/lookUpGitHubRepository';
import { PreviewCredentialState } from './PreviewCredential';
import { defaultPreviewDomain } from './previewDomain';
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
	{ policy, credential }: { policy: PreviewPolicy; credential: PreviewCredentialState },
) {
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
		credential: credential === 'sealed',
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
					{credential === 'unknown'
						? (
							<p className="mt-2 text-muted-foreground">
								Checking whether a GitHub token is sealed, which this file names…
							</p>
						)
						: (
							<>
								{credential === 'unreadable' && (
									<p className="mt-2 text-destructive">
										This cluster's secrets couldn't be read, so this file may be missing{' '}
										<code className="font-mono">credential: true</code>, which a private repository needs.
									</p>
								)}
								<CopyableBlock text={workflow} label="Copy workflow" />
							</>
						)}
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
					<CopyableValue value={audience} label={`Copy ${PREVIEW_TARGET_VARIABLE}`} />
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
				On a public repository, GitHub's default rule blocks pull_request_target from 2026-12-02, so its Actions policy
				has to allow this workflow.{' '}
				<a className="underline" href={GITHUB_RULE_URL} target="_blank" rel="noreferrer">GitHub's announcement</a>
			</p>
		</section>
	);
}
