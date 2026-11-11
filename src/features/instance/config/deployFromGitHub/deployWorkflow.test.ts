import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { DEPLOY_ACTION, deployWorkflowText } from './deployWorkflow';

const text = (branch = 'main', environment = 'production', app = 'shop') =>
	deployWorkflowText({ app, branch, environment });

/* eslint-disable @typescript-eslint/no-explicit-any -- a parsed workflow */
const parsed = (workflow: string): any => parse(workflow, { schema: 'failsafe' });

describe('deployWorkflowText', () => {
	it('deploys on pushes to the branch the policy pins, and only from that branch', () => {
		const workflow = parsed(text('release/1.0'));
		expect(workflow.on.push.branches).toEqual(['release/1.0']);
		expect(Object.keys(workflow.on)).toEqual(['push', 'workflow_dispatch']);
		expect(workflow.jobs.deploy.if).toBe("github.ref == 'refs/heads/release/1.0'");
	});

	it('runs one job, in the environment the policy pins, with only the identity token and a read', () => {
		const workflow = parsed(text('main', 'prod-eu'));
		expect(Object.keys(workflow.jobs)).toEqual(['deploy']);
		expect(workflow.jobs.deploy.environment).toBe('prod-eu');
		expect(workflow.jobs.deploy.permissions).toEqual({ 'contents': 'read', 'id-token': 'write' });
		expect(workflow.permissions).toEqual({ contents: 'read' });
	});

	it("checks out without the job's token, refuses an empty target, and runs deploy-action pinned by commit", () => {
		const { steps } = parsed(text()).jobs.deploy;
		expect(steps.map((step: { name: string }) => step.name)).toEqual([
			'Refuse to redeploy an older commit',
			'Checkout code',
			'Check the deploy target',
			'Deploy',
		]);
		expect(steps[1].with).toEqual({ 'persist-credentials': 'false' });
		expect(steps[2].run).toContain('[ -n "$HARPER_CLI_TARGET" ] ||');
		expect(text()).toContain(`        uses: ${DEPLOY_ACTION}\n`);
		expect(DEPLOY_ACTION).toMatch(/^HarperFast\/deploy-action@[0-9a-f]{40} # v1\.0\.0$/);
		expect(steps[3].with).toEqual({ target: '${{ env.HARPER_CLI_TARGET }}', app: 'shop', restart: 'rolling' });
		expect(parsed(text()).jobs.deploy.env).toEqual({ HARPER_CLI_TARGET: '${{ vars.HARPER_CLI_TARGET }}' });
	});

	it("leaves out create-harper's test job and its pull_request trigger", () => {
		expect(text()).not.toMatch(/pull_request|needs:|npm |your-package-manager/);
	});

	it('quotes every value from the policy, so a numeric-looking one stays text', () => {
		// The default schema, unlike failsafe, reads an unquoted 1.0 as a number.
		const workflow = parse(text('1.0', '2024', '007'));
		expect(workflow.on.push.branches).toEqual(['1.0']);
		expect(workflow.jobs.deploy.environment).toBe('2024');
		expect(workflow.jobs.deploy.steps[3].with.app).toBe('007');
	});
});
