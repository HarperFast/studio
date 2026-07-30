import { describe, expect, it } from 'vitest';
import { redactErrorText } from './redactErrorText';

describe('redactErrorText', () => {
	it('redacts the path of an scp-style git remote, keeping user and host', () => {
		expect(redactErrorText('Failed to deploy git@github.com:acme-corp/billing-service.git: exit code 128'))
			.toBe('Failed to deploy git@github.com:<redacted>: exit code 128');
		// Host aliases are how a customer selects between multiple keys (#1318) — keep them.
		expect(redactErrorText('git@github-work:acme-corp/internal.git not found'))
			.toBe('git@github-work:<redacted> not found');
		// A bare SSH server has no owner prefix; the `.git` suffix is the tell.
		expect(redactErrorText('Failed to deploy git@server.example.com:billing-service.git: exit code 128'))
			.toBe('Failed to deploy git@server.example.com:<redacted>: exit code 128');
	});

	it('redacts the path of a repository URL, keeping scheme and host', () => {
		expect(redactErrorText('Cannot clone https://github.com/acme-corp/billing-service'))
			.toBe('Cannot clone https://github.com/<redacted>');
		expect(redactErrorText('Cannot clone ssh://git@source.example.com/acme/repo'))
			.toBe('Cannot clone ssh://source.example.com/<redacted>');
		expect(redactErrorText('https://build.example.com/acme/app.git failed'))
			.toBe('https://build.example.com/<redacted> failed');
		// npm/pip-style `git+<transport>` remotes parse as their own protocol; keep it in the output.
		expect(redactErrorText('Cannot clone git+https://custom-forge.com/acme/repo'))
			.toBe('Cannot clone git+https://custom-forge.com/<redacted>');
		expect(redactErrorText('Cannot clone git+ssh://git@custom-forge.com/acme/repo.git'))
			.toBe('Cannot clone git+ssh://custom-forge.com/<redacted>');
	});

	// The gap that made "is this a repository?" the wrong question: a self-hosted forge under a
	// name that says nothing about git, with no `.git` suffix, is exactly the enterprise setup
	// whose repo names we most need to keep out of Datadog.
	it('redacts a self-hosted forge under a custom domain, including nested group paths', () => {
		expect(redactErrorText('Failed to deploy https://scm.acme-corp.com/acme-corp/billing-service: 404 not found'))
			.toBe('Failed to deploy https://scm.acme-corp.com/<redacted>: 404 not found');
		expect(redactErrorText('https://code.acme.io/platform/payments/billing-service failed'))
			.toBe('https://code.acme.io/<redacted> failed');
	});

	// Studio looks the repo up itself while the deploy form is filled in (`getGitHubRepo`), so
	// the same owner/name reaches Datadog through a plain API URL, not a git remote.
	it('redacts the repository lookups Studio makes on the customer’s behalf', () => {
		expect(redactErrorText('Request failed with status code 404 https://api.github.com/repos/acme-corp/billing'))
			.toBe('Request failed with status code 404 https://api.github.com/<redacted>');
		expect(redactErrorText('https://registry.npmjs.org/@acme-corp/internal-component failed'))
			.toBe('https://registry.npmjs.org/<redacted> failed');
	});

	it('drops the query and fragment of a redacted URL, which can name a private branch', () => {
		expect(redactErrorText('https://github.com/acme-corp/app.git?ref=feature/pricing#v2 failed'))
			.toBe('https://github.com/<redacted> failed');
	});

	it('keeps sentence punctuation that follows a URL outside the redaction', () => {
		expect(
			redactErrorText(
				'Failed to deploy private repository https://github.com/acme-corp/app.git: SSH access failed.',
			),
		).toBe('Failed to deploy private repository https://github.com/<redacted>: SSH access failed.');
	});

	it('strips credentials embedded in any URL, Harper-hosted or not', () => {
		expect(redactErrorText('POST https://acme:ghp_secret@github.com/acme-corp/app.git failed'))
			.toBe('POST https://github.com/<redacted> failed');
		expect(redactErrorText('POST https://user:hunter2@api.harper.fast/HDBInstance/ins-1/operation failed'))
			.toBe('POST https://api.harper.fast/HDBInstance/ins-1/operation failed');
	});

	it('leaves Harper API endpoints and Studio asset URLs intact, so errors stay triageable', () => {
		const message = 'Request failed with status code 500 https://api.harper.fast/HDBInstance/ins-123/operation';
		expect(redactErrorText(message)).toBe(message);
		// Subdomains of a Harper domain count, which is what keeps Datadog's source maps — matched
		// on the frame's URL — pointing at real Studio code.
		const stack = [
			'TypeError: x is not a function',
			'  at getOrganization @ https://fabric.harper.fast/assets/index-A1b2C3d4.js:5:1234',
			'  at pn @ https://stage.studio.harperfabric.com/assets/vendor-datadog-DBn-aOxh.js:3:3396',
		].join('\n');
		expect(redactErrorText(stack)).toBe(stack);
	});

	it('leaves a host with no path alone rather than inventing one', () => {
		// A self-hosted instance the customer registered by URL: the host is already in the event,
		// and there is no path to give away.
		expect(redactErrorText('Network Error https://harper.acme.com:9925/'))
			.toBe('Network Error https://harper.acme.com:9925/');
	});

	it('leaves ordinary error text alone', () => {
		expect(redactErrorText('AxiosError: timeout of 60000ms exceeded'))
			.toBe('AxiosError: timeout of 60000ms exceeded');
		// An email followed by a colon must not be mistaken for an scp-style remote.
		expect(redactErrorText('dawson@harperdb.io: sign-in failed')).toBe('dawson@harperdb.io: sign-in failed');
		expect(redactErrorText('not-a-url://')).toBe('not-a-url://');
	});
});
