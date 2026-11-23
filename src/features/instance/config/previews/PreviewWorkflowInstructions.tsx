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

const POLICY_GUIDE_URL =
	'https://docs.github.com/en/actions/how-tos/administer/control-workflow-execution#creating-a-workflow-execution-policy';
const POLICY_ANNOUNCEMENT_URL =
	'https://github.blog/changelog/2026-11-02-pull_request_target-blocked-by-default-december-2';

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
				<li>
					<p>
						<strong>On a public repository, let GitHub run this workflow.</strong> From 2026-12-02 GitHub blocks the
						{' '}
						<code className="font-mono">pull_request_target</code>{' '}
						event in public repositories by default, so no preview would deploy. That default doesn't apply to private
						repositories.
					</p>
					<p className="mt-2">
						In the repository's <strong>Settings → Actions → Policies</strong>, create a policy with enforcement status
						{' '}
						<strong>Active</strong> and the <strong>Restrict events</strong> rule allowing{' '}
						<code className="font-mono">pull_request_target</code>, targeted at{' '}
						<code className="font-mono">{workflowPath}</code>{' '}
						only. A policy permits just the events it lists, so a wider target would block your other workflows' events.
						This takes a repository administrator.
					</p>
					<p className="mt-2">
						An organization owner can create it in the organization's settings instead, at the same place. Target{' '}
						<code className="font-mono">{repository || 'this repository'}</code>{' '}
						as well as the file, or the policy applies to that path in every repository. If an event policy already
						applies, GitHub adds no default one: every Active policy that applies has to allow{' '}
						<code className="font-mono">pull_request_target</code>{' '}
						for this workflow. Policy insights, under Policies, shows which one blocked a run; ask its owner to allow it
						for this repository and file.
					</p>
					<p className="mt-2 text-muted-foreground">
						<a className="underline" href={POLICY_GUIDE_URL} target="_blank" rel="noreferrer">
							GitHub's guide to workflow execution policies
						</a>{' '}
						·{' '}
						<a className="underline" href={POLICY_ANNOUNCEMENT_URL} target="_blank" rel="noreferrer">
							GitHub's announcement
						</a>
					</p>
				</li>
			</ol>
		</section>
	);
}
