/**
 * The workflow the Previews panel tells people to commit: `HarperFast/deploy-action`'s `examples/preview.yaml`, with
 * this policy's application, branch and environments. The action holds the lifecycle (it deploys only while the PR is
 * open at that commit, drops what it deployed if the PR closed meanwhile, waits out a running deploy before a drop, and
 * keeps a reopened PR's preview), and it picks the CLI version. So the file only names what differs from its defaults;
 * `starterPreviewWorkflow.test.ts` pins the text that matters. Every value from the policy is quoted, so none can add a
 * key or a step to a job that holds the identity.
 */

const PREVIEW_ACTION = 'HarperFast/deploy-action@v1';
export const PREVIEW_ENVIRONMENT = 'preview';
export const PREVIEW_CLEANUP_ENVIRONMENT = 'preview-cleanup';
export const PREVIEW_TARGET_VARIABLE = 'HARPER_PREVIEW_TARGET';
export const PREVIEW_WORKFLOW_PATH = '.github/workflows/preview.yaml';

export interface PreviewWorkflowOptions {
	app: string;
	branch: string;
	environment?: string;
	cleanupEnvironment?: string;
	/** Passed only when it is not the action's default, `app.<target host>`. */
	domain?: string;
	credential?: boolean;
	shared?: boolean;
}

/**
 * It runs from the default branch and never checks out the PR, so a PR cannot change what runs with the identity, and
 * the cluster fetches the PR's commit itself. Cleanup runs in its own environment, so a closure never waits for an
 * approval.
 */
export function previewWorkflowText({
	app,
	branch,
	environment = PREVIEW_ENVIRONMENT,
	cleanupEnvironment = PREVIEW_CLEANUP_ENVIRONMENT,
	domain,
	credential,
	shared,
}: PreviewWorkflowOptions): string {
	const sameRepository = 'github.event.pull_request.head.repo.full_name == github.repository';
	const steps = (...inputs: string[]) => [
		'    steps:',
		`      - uses: ${PREVIEW_ACTION}`,
		'        with:',
		`          target: \${{ vars.${PREVIEW_TARGET_VARIABLE} }}`,
		`          app: ${JSON.stringify(app)}`,
		'          preview: true',
		...inputs.map((input) => `          ${input}`),
	];
	// A drop reads none of these, so only the deploy names them.
	const deployInputs = [
		...(domain ? [`domain: ${JSON.stringify(domain)}`] : []),
		...(credential ? ['credential: true'] : []),
		...(shared ? ['branched_databases: false'] : []),
	];
	// The PR comment and the GitHub Deployment need the two writes.
	const permissions = [
		'    permissions:',
		'      id-token: write',
		'      pull-requests: write',
		'      deployments: write',
	];
	return [
		'# Set up with the Previews panel in Harper Studio.',
		'name: Preview',
		'on:',
		'  pull_request_target:',
		'    types: [opened, reopened, synchronize, closed]',
		`    branches: [${JSON.stringify(branch)}]`,
		'permissions: {}',
		'jobs:',
		'  deploy:',
		`    if: github.event.action != 'closed' && ${sameRepository}`,
		'    runs-on: ubuntu-latest',
		`    environment: ${JSON.stringify(environment)}`,
		...permissions,
		'    concurrency:',
		'      group: harper-preview-${{ github.event.pull_request.number }}',
		...steps(...deployInputs),
		'  cleanup:',
		`    if: github.event.action == 'closed' && ${sameRepository}`,
		'    runs-on: ubuntu-latest',
		`    environment: ${JSON.stringify(cleanupEnvironment)}`,
		...permissions,
		...steps(),
		'',
	].join('\n');
}
