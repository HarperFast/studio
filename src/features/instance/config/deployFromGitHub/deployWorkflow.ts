/**
 * The workflow Deploy from GitHub tells people to commit: create-harper's `deploy.yaml` (HarperFast/create-harper#156)
 * without its `test` job, which runs a package manager's scripts Studio can't know. Everything else is that file's text,
 * except that the branch, environment and application are this policy's, and are quoted: none of them can then add a
 * key or a step to a job that holds `id-token: write`. `deployWorkflow.test.ts` pins the lines that matter.
 */
import { CI_DEPLOY_TARGET_VARIABLE } from '@/integrations/api/instance/ciDeploy/ciDeploy';

/** deploy-action's v1.0.0, pinned by commit as create-harper pins it. */
export const DEPLOY_ACTION = 'HarperFast/deploy-action@45fa59b6157eabb72b7a74922309238671f2a37d # v1.0.0';
const CHECKOUT_ACTION = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1';

export interface DeployWorkflowOptions {
	app: string;
	/** Already checked by `isCiDeployBranch`, so it is safe inside the `if:` expression's quotes. */
	branch: string;
	environment: string;
}

export function deployWorkflowText({ app, branch, environment }: DeployWorkflowOptions): string {
	const target = CI_DEPLOY_TARGET_VARIABLE;
	return [
		`# Deploys to your Harper cluster when a change merges to \`${branch}\`. The deploy job holds no Harper`,
		"# credential: HarperFast/deploy-action authenticates with GitHub's OIDC token under a trust policy on",
		'# the cluster, which Deploy from GitHub in Harper Studio set up.',
		'name: Deploy to Harper',
		'on:',
		'  push:',
		`    branches: [${JSON.stringify(branch)}]`,
		'  workflow_dispatch:',
		'',
		'permissions:',
		'  contents: read',
		'',
		"# One run per branch at a time, so an older commit can't deploy after a newer one; a newer run",
		'# replaces one still waiting.',
		'concurrency:',
		'  group: deploy-${{ github.ref }}',
		'',
		'jobs:',
		'  deploy:',
		`    if: github.ref == 'refs/heads/${branch}'`,
		'    runs-on: ubuntu-latest',
		`    environment: ${JSON.stringify(environment)}`,
		'    permissions:',
		'      contents: read',
		'      id-token: write',
		'    env:',
		`      ${target}: \${{ vars.${target} }}`,
		'    steps:',
		'      - name: Refuse to redeploy an older commit',
		'        # Re-running an old run keeps its commit, which would replace a newer release.',
		'        if: github.run_attempt > 1',
		'        env:',
		'          GH_TOKEN: ${{ github.token }}',
		'        run: |',
		'          HEAD=$(gh api "repos/$GITHUB_REPOSITORY/commits/$GITHUB_REF_NAME" --jq .sha)',
		'          [ "$HEAD" = "$GITHUB_SHA" ] || { echo "::error::$GITHUB_REF_NAME is now at $HEAD; re-running this deploy would replace it with $GITHUB_SHA"; exit 1; }',
		'      - name: Checkout code',
		`        uses: ${CHECKOUT_ACTION}`,
		'        with:',
		"          # The deploy uploads this directory, `.git` included, so keep the job's token out of it.",
		'          persist-credentials: false',
		'      - name: Check the deploy target',
		"        # The action refuses an empty target too, but can't say where its value comes from.",
		'        run: |',
		`          [ -n "$${target}" ] || { echo "::error::Set the ${target} repository variable to the value Deploy from GitHub in Harper Studio shows"; exit 1; }`,
		'      - name: Deploy',
		"        # From Harper 5.4 this waits for every node, and fails the run if a node's canary rejects the release.",
		`        uses: ${DEPLOY_ACTION}`,
		'        with:',
		`          target: \${{ env.${target} }}`,
		`          app: ${JSON.stringify(app)}`,
		'          restart: rolling',
		'',
	].join('\n');
}
