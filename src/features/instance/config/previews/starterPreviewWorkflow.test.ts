import { describe, expect, it } from 'vitest';
import { previewWorkflowText } from './starterPreviewWorkflow';

const job = (text: string, name: 'deploy' | 'cleanup') =>
	name === 'deploy'
		? text.slice(text.indexOf('  deploy:'), text.indexOf('  cleanup:'))
		: text.slice(text.indexOf('  cleanup:'));

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

	it('runs deploy-action in both jobs, pointed at the repository variable the panel tells people to set', () => {
		const text = previewWorkflowText({ app: 'shop', branch: 'main' });
		for (const name of ['deploy', 'cleanup'] as const) {
			expect(job(text, name)).toContain(
				[
					'      - uses: HarperFast/deploy-action@v1',
					'        with:',
					'          target: ${{ vars.HARPER_PREVIEW_TARGET }}',
					'          app: shop',
					'          preview: true',
				].join('\n'),
			);
		}
		expect(text).not.toContain('npm install');
	});

	it('grants each job what the action needs for the PR comment and the Deployment', () => {
		const text = previewWorkflowText({ app: 'shop', branch: 'main' });
		const permissions =
			'    permissions:\n      id-token: write\n      pull-requests: write\n      deployments: write\n';
		expect(job(text, 'deploy')).toContain(permissions);
		expect(job(text, 'cleanup')).toContain(permissions);
	});

	it('runs the two jobs in the two environments the trust policies pin', () => {
		const text = previewWorkflowText({ app: 'shop', branch: 'main' });
		expect(job(text, 'deploy')).toContain('    environment: preview\n');
		expect(job(text, 'cleanup')).toContain('    environment: preview-cleanup\n');
		const custom = previewWorkflowText({
			app: 'shop',
			branch: 'main',
			environment: 'review',
			cleanupEnvironment: 'teardown',
		});
		expect(job(custom, 'deploy')).toContain('    environment: review\n');
		expect(job(custom, 'cleanup')).toContain('    environment: teardown\n');
	});

	it('quotes the branch', () => {
		expect(previewWorkflowText({ app: 'shop', branch: 'release/1.0' })).toContain('branches: ["release/1.0"]');
	});

	it('passes only what differs from the defaults, and only to the deploy', () => {
		const base = previewWorkflowText({ app: 'shop', branch: 'main' });
		expect(base).not.toMatch(/domain:|credential:|branched_databases:/);
		const text = previewWorkflowText({
			app: 'shop',
			branch: 'main',
			domain: 'app.example.com',
			credential: true,
			shared: true,
		});
		expect(job(text, 'deploy')).toContain(
			'          preview: true\n'
				+ '          domain: app.example.com\n'
				+ '          credential: true\n'
				+ '          branched_databases: false\n',
		);
		expect(job(text, 'cleanup')).not.toMatch(/domain:|credential:|branched_databases:/);
	});

	it('ends with a newline, for a file that is pasted as it is', () => {
		expect(previewWorkflowText({ app: 'shop', branch: 'main' }).endsWith('preview: true\n')).toBe(true);
	});
});
