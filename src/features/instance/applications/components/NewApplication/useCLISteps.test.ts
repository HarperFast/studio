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

	it('tells people to take the harper login offer, and that the deploy uses it', () => {
		const steps = buildCLISteps('my-app', 'https://my-cluster.example.com:9925/');
		expect(steps.find((step) => step.title === 'Create your awesome app')?.note).toMatch(/harper login/);
		expect(steps.find((step) => step.title === 'Deploy!')?.note).toMatch(/login from step 2/);
	});

	it('leaves the URL out when the cluster has none yet', () => {
		const create = buildCLISteps('my-app', undefined).find((step) => step.title === 'Create your awesome app');
		expect(create?.code).toBe('npm create harper my-app');
	});
});
