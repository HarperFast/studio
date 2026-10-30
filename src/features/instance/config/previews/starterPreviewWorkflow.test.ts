import { describe, expect, it } from 'vitest';
import { previewWorkflowText } from './starterPreviewWorkflow';

const deployLine = (text: string) => text.split('\n').find((line) => line.includes('harper preview deploy'))?.trim();

describe('previewWorkflowText', () => {
	it('keeps PR code away from the identity: pull_request_target, no checkout, same repository only', () => {
		const text = previewWorkflowText({ app: 'shop', branch: 'main' });
		expect(text).toContain('  pull_request_target:\n    types: [opened, reopened, synchronize, closed]');
		expect(text).toContain('permissions: {}');
		expect(text).not.toContain('actions/checkout');
		const sameRepository = 'github.event.pull_request.head.repo.full_name == github.repository';
		expect(text).toContain(`if: github.event.action != 'closed' && ${sameRepository}`);
		expect(text).toContain(`if: github.event.action == 'closed' && ${sameRepository}`);
	});

	it('reads the target from the repository variable the panel tells people to set', () => {
		expect(previewWorkflowText({ app: 'shop', branch: 'main' })).toContain(
			'HARPER_CLI_TARGET: ${{ vars.HARPER_PREVIEW_TARGET }}',
		);
	});

	it('runs the two jobs in the two environments the trust policies pin', () => {
		const text = previewWorkflowText({ app: 'shop', branch: 'main' });
		expect(text).toContain('    environment: preview\n');
		expect(text).toContain('    environment: preview-cleanup\n');
		expect(previewWorkflowText({ app: 'shop', branch: 'main', environment: 'review' })).toContain(
			'    environment: review\n',
		);
	});

	it('quotes the branch, and names the application in every preview command', () => {
		const text = previewWorkflowText({ app: 'shop', branch: 'release/1.0' });
		expect(text).toContain('branches: ["release/1.0"]');
		expect(text).toContain('harper preview drop app=shop pr="$PR" && exit 0');
	});

	it('passes only what differs from the defaults to the deploy', () => {
		const base = 'harper preview deploy app=shop pr="$PR" branch="$BRANCH" by_ref=true ref="$SHA"';
		expect(deployLine(previewWorkflowText({ app: 'shop', branch: 'main' }))).toBe(`${base} || deployed=$?`);
		expect(deployLine(previewWorkflowText({
			app: 'shop',
			branch: 'main',
			domain: 'app.example.com',
			credential: true,
			shared: true,
		}))).toBe(`${base} domain=app.example.com credential=true branchedDatabases=false || deployed=$?`);
	});

	it('ends with a newline, for a file that is pasted as it is', () => {
		expect(previewWorkflowText({ app: 'shop', branch: 'main' }).endsWith('exit 1\n')).toBe(true);
	});
});
