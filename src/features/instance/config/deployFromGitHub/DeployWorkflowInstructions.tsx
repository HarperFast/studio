import { CopyableBlock, CopyableValue } from '@/features/instance/config/githubActions/CopyableText';
import { CI_DEPLOY_TARGET_VARIABLE, CiDeploySource } from '@/integrations/api/instance/ciDeploy/ciDeploy';
import { deployWorkflowText } from './deployWorkflow';

function GitHubSettingsLink({ repository, page, children }: { repository: string; page: string; children: string }) {
	return (
		<>
			{' '}
			(<a
				className="underline"
				href={`https://github.com/${repository}/settings/${page}`}
				target="_blank"
				rel="noreferrer"
			>
				{children}
			</a>)
		</>
	);
}

/** Built from what the cluster holds rather than the form, so it reads the same on every visit. */
export function DeployWorkflowInstructions(
	{ app, source, audience }: { app: string; source: CiDeploySource; audience: string },
) {
	const { repository, workflow, branch, environment } = source;
	return (
		<section className="flex flex-col gap-3 rounded-md border p-4 text-sm" aria-label="What to commit">
			<h3 className="font-semibold">What to commit</h3>
			<ol className="flex list-decimal flex-col gap-3 pl-4">
				<li>
					<p>
						Commit this file to <code className="font-mono">{branch}</code> as{' '}
						<code className="font-mono">{workflow}</code>.
					</p>
					<CopyableBlock text={deployWorkflowText({ app, branch, environment })} label="Copy workflow" />
				</li>
				<li>
					<p>
						Add a repository variable named <code className="font-mono">{CI_DEPLOY_TARGET_VARIABLE}</code>{' '}
						with this value
						<GitHubSettingsLink repository={repository} page="variables/actions">Actions variables</GitHubSettingsLink>:
					</p>
					<CopyableValue value={audience} label={`Copy ${CI_DEPLOY_TARGET_VARIABLE}`} />
				</li>
				<li>
					The job runs in the <code className="font-mono">{environment}</code>{' '}
					environment, which GitHub creates on the first run if it doesn't exist
					<GitHubSettingsLink repository={repository} page="environments">Environments</GitHubSettingsLink>. Required
					reviewers on it make someone approve each deploy.
				</li>
			</ol>
			<p className="text-muted-foreground">
				Then each merge to {branch} deploys {app}, and GitHub holds no Harper credential.
			</p>
		</section>
	);
}
