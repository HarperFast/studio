import { DeploymentSource } from '@/integrations/api/instance/deployments/types';
import { describe, expect, it } from 'vitest';
import { describeSource } from './describeSource';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const github: DeploymentSource = {
	via: 'oidc',
	policy: 'web-main',
	repository: 'acme/web',
	sha: SHA,
	ref: 'refs/heads/main',
	workflow_ref: 'acme/web/.github/workflows/deploy.yml@refs/heads/main',
	run_id: '123456',
	run_attempt: '2',
	actor: 'octocat',
	environment: 'production',
};

describe('describeSource', () => {
	it('links an attested GitHub source to its commit and run, and names the trust policy', () => {
		expect(describeSource(github)).toMatchObject({
			attested: true,
			via: 'OIDC',
			viaDetail: expect.stringContaining('trust policy web-main'),
			shortSha: '0123456',
			commitUrl: `https://github.com/acme/web/commit/${SHA}`,
			run: {
				label: 'deploy.yml #123456 (attempt 2)',
				url: 'https://github.com/acme/web/actions/runs/123456/attempts/2',
			},
		});
	});

	it('says a declared source is unverified, and still links it when it names its own GitHub workflow', () => {
		const declared = describeSource({ ...github, via: 'declared', policy: undefined, dirty: true });
		expect(declared).toMatchObject({ attested: false, via: 'Declared', dirty: true });
		expect(declared.viaDetail).toMatch(/Nothing verified it/);
		expect(declared.commitUrl).toBe(`https://github.com/acme/web/commit/${SHA}`);
	});

	it('links nowhere when nothing says the repository is on GitHub', () => {
		const elsewhere = describeSource({ via: 'oidc', policy: 'p', repository: 'group/web', sha: SHA, run_id: '9' });
		expect(elsewhere.commitUrl).toBeUndefined();
		expect(elsewhere.run).toEqual({ label: 'Run #9', url: undefined });
		expect(describeSource({ via: 'declared', run_id: '9', workflow_ref: '' }).run?.label).toBe('Run #9');
		const otherRepository = describeSource({ ...github, workflow_ref: 'acme/ci/.github/workflows/x.yml@main' });
		expect(otherRepository.commitUrl).toBeUndefined();
	});

	it('neither shortens nor links a commit that is not a hash', () => {
		const described = describeSource({ ...github, sha: 'main' });
		expect(described.shortSha).toBe('main');
		expect(described.commitUrl).toBeUndefined();
	});
});
