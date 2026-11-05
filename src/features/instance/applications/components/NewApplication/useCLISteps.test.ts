/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { buildCLISteps } from './useCLISteps';

describe('buildCLISteps', () => {
	it('passes the cluster URL to create-harper, and nothing it no longer accepts', () => {
		const steps = buildCLISteps('My App', 'https://my-cluster.example.com:9925/');
		const create = steps.find((step) => step.title === 'Create your awesome app');
		expect(create?.code).toBe('npm create harper my-app -- --deploymentURL="https://my-cluster.example.com:9925/"');
		// create-harper dropped --deploymentUsername and the .env password when it moved to `harper login`.
		for (const step of steps) {
			expect(step.code).not.toMatch(/deploymentUsername/);
			expect(step.note ?? '').not.toMatch(/password for this cluster|\.env file/);
		}
	});

	it("ends with create-harper's outro: harper login, deploy:setup-ci, then each merge to main deploys", () => {
		const steps = buildCLISteps('my-app', 'https://my-cluster.example.com:9925/');
		expect(steps.slice(-3).map((step) => step.code)).toEqual([
			'harper login',
			'npm run deploy:setup-ci',
			'git push origin main',
		]);
		expect(steps.at(-3)?.title).toMatch(/super user/);
		expect(steps.at(-2)?.note).toMatch(/GitHub repository first/);
		expect(steps.at(-1)?.note).toMatch(/Every merge to main deploys/);
		// The old last step deployed from the laptop with the saved login.
		expect(steps.map((step) => step.code)).not.toContain('npm run deploy');
	});

	it('leaves the URL out when the cluster has none yet', () => {
		const create = buildCLISteps('my-app', undefined).find((step) => step.title === 'Create your awesome app');
		expect(create?.code).toBe('npm create harper my-app');
	});
});
