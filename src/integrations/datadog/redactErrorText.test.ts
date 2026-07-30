import { describe, expect, it } from 'vitest';
import { redactErrorText } from './redactErrorText';

describe('redactErrorText', () => {
	it('redacts the path of an scp-style git remote, keeping user and host', () => {
		expect(redactErrorText('Failed to deploy git@github.com:acme-corp/billing-service.git: exit code 128'))
			.toBe('Failed to deploy git@github.com:<redacted>: exit code 128');
		// Host aliases are how a customer selects between multiple keys (#1318) — keep them.
		expect(redactErrorText('git@github-work:acme-corp/internal.git not found'))
			.toBe('git@github-work:<redacted> not found');
	});

	it('redacts the path of an https/ssh repository URL, keeping scheme and host', () => {
		expect(redactErrorText('Cannot clone https://github.com/acme-corp/billing-service'))
			.toBe('Cannot clone https://github.com/<redacted>');
		expect(redactErrorText('Cannot clone ssh://git@source.example.com/acme/repo'))
			.toBe('Cannot clone ssh://source.example.com/<redacted>');
		// A self-hosted forge under the conventional `git.` prefix, and a `.git` path anywhere.
		expect(redactErrorText('https://git.acme-corp.com/team/app failed'))
			.toBe('https://git.acme-corp.com/<redacted> failed');
		expect(redactErrorText('https://build.example.com/acme/app.git failed'))
			.toBe('https://build.example.com/<redacted> failed');
	});

	it('drops the query and fragment of a repository URL, which can name a private branch', () => {
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

	it('strips credentials embedded in any URL, repository or not', () => {
		expect(redactErrorText('POST https://acme:ghp_secret@github.com/acme-corp/app.git failed'))
			.toBe('POST https://github.com/<redacted> failed');
		expect(redactErrorText('POST https://user:hunter2@api.harper.fast/HDBInstance/ins-1/operation failed'))
			.toBe('POST https://api.harper.fast/HDBInstance/ins-1/operation failed');
	});

	it('leaves Harper API endpoints and Studio asset URLs intact, so errors stay triageable', () => {
		const message = 'Request failed with status code 500 https://api.harper.fast/HDBInstance/ins-123/operation';
		expect(redactErrorText(message)).toBe(message);
		const stack = [
			'TypeError: x is not a function',
			'  at getOrganization @ https://fabric.harper.fast/assets/index-A1b2C3d4.js:5:1234',
			'  at pn @ https://fabric.harper.fast/assets/vendor-datadog-DBn-aOxh.js:3:3396',
		].join('\n');
		expect(redactErrorText(stack)).toBe(stack);
	});

	it('leaves ordinary error text alone', () => {
		expect(redactErrorText('AxiosError: timeout of 60000ms exceeded'))
			.toBe('AxiosError: timeout of 60000ms exceeded');
		// An email followed by a colon must not be mistaken for an scp-style remote.
		expect(redactErrorText('dawson@harperdb.io: sign-in failed')).toBe('dawson@harperdb.io: sign-in failed');
		expect(redactErrorText('not-a-url://')).toBe('not-a-url://');
	});
});
