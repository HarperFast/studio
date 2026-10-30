/**
 * The workflow the Previews panel tells people to commit, and the one place to change when
 * `HarperFast/deploy-action` (harper#3055) ships: swap the body of `previewWorkflowText` for that form.
 *
 * Until then this is `starterPreviewWorkflow` from harper's `bin/previewSetup.ts`, line for line apart from the header
 * comment. Harper has no operation that returns it, so a change there has to be copied here;
 * `starterPreviewWorkflow.test.ts` pins the text that matters.
 */

export const PREVIEW_ENVIRONMENT = 'preview';
export const PREVIEW_CLEANUP_ENVIRONMENT = 'preview-cleanup';
export const PREVIEW_TARGET_VARIABLE = 'HARPER_PREVIEW_TARGET';
export const PREVIEW_WORKFLOW_PATH = '.github/workflows/preview.yaml';

export interface PreviewWorkflowOptions {
	app: string;
	branch: string;
	environment?: string;
	/** Passed to `harper preview deploy` only when it is not the target's default. */
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
	domain,
	credential,
	shared,
}: PreviewWorkflowOptions): string {
	const deployArguments = [
		`app=${app}`,
		'pr="$PR"',
		'branch="$BRANCH"',
		'by_ref=true',
		'ref="$SHA"',
		...(domain ? [`domain=${domain}`] : []),
		...(credential ? ['credential=true'] : []),
		...(shared ? ['branchedDatabases=false'] : []),
	].join(' ');
	const sameRepository = 'github.event.pull_request.head.repo.full_name == github.repository';
	const setup = [
		'      - uses: actions/setup-node@v7',
		'        with:',
		'          node-version: 24',
		'      - run: npm install --global harper@^5.4',
	];
	return [
		'# Set up with the Previews panel in Harper Studio.',
		'name: Preview',
		'on:',
		'  pull_request_target:',
		'    types: [opened, reopened, synchronize, closed]',
		`    branches: [${JSON.stringify(branch)}]`,
		'permissions: {}',
		'env:',
		`  HARPER_CLI_TARGET: \${{ vars.${PREVIEW_TARGET_VARIABLE} }}`,
		'  PR: ${{ github.event.pull_request.number }}',
		'jobs:',
		'  deploy:',
		`    if: github.event.action != 'closed' && ${sameRepository}`,
		'    runs-on: ubuntu-latest',
		`    environment: ${environment}`,
		'    permissions:',
		'      id-token: write',
		'      pull-requests: read',
		'    concurrency:',
		'      group: harper-preview-${{ github.event.pull_request.number }}',
		'    env:',
		'      BRANCH: ${{ github.event.pull_request.head.ref }}',
		'      SHA: ${{ github.event.pull_request.head.sha }}',
		'      GH_TOKEN: ${{ github.token }}',
		'    steps:',
		...setup,
		'      - run: |',
		`          pr() { gh api "repos/$GITHUB_REPOSITORY/pulls/$PR" --jq '.state + " " + .head.sha'; }`,
		'          before=$(pr)',
		'          if [ "$before" = "open $SHA" ]; then',
		`            harper preview deploy ${deployArguments} || deployed=$?`,
		'            # Closed while this deployed: its cleanup may have run first.',
		'            after=$(pr)',
		`            if [ "\${after%% *}" = closed ]; then harper preview drop app=${app} pr="$PR"; fi`,
		'            exit "${deployed:-0}"',
		'          fi',
		'  cleanup:',
		`    if: github.event.action == 'closed' && ${sameRepository}`,
		'    runs-on: ubuntu-latest',
		`    environment: ${PREVIEW_CLEANUP_ENVIRONMENT}`,
		'    permissions:',
		'      id-token: write',
		'      pull-requests: read',
		'    env:',
		'      GH_TOKEN: ${{ github.token }}',
		'    steps:',
		...setup,
		'      - run: |',
		'          # A deploy still holding the preview answers 409 until it finishes; a reopened PR keeps its preview.',
		'          for attempt in 1 2 3 4 5; do',
		`            if state=$(gh api "repos/$GITHUB_REPOSITORY/pulls/$PR" --jq .state); then`,
		'              [ "$state" = closed ] || exit 0',
		`              harper preview drop app=${app} pr="$PR" && exit 0`,
		'            fi',
		'            sleep 30',
		'          done',
		'          exit 1',
		'',
	].join('\n');
}
