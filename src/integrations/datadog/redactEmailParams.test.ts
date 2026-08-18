import { describe, expect, it } from 'vitest';
import { redactEmailParams } from './redactEmailParams';

describe('redactEmailParams', () => {
	// Studio uses hash routing, so the param lives in the fragment. A `URLSearchParams`-based
	// implementation reads an empty `search` here and would leave the address untouched.
	it('redacts an address carried in the hash-routed auth query', () => {
		expect(redactEmailParams('https://fabric.harper.fast/#/sign-in?me=someone%40example.com'))
			.toBe('https://fabric.harper.fast/#/sign-in?me=<redacted>');
	});

	it('redacts the post-sign-up verifying hand-off', () => {
		expect(redactEmailParams('https://fabric.harper.fast/#/verifying?email=someone%40example.com'))
			.toBe('https://fabric.harper.fast/#/verifying?email=<redacted>');
	});

	it.each([
		'sign-up',
		'forgot-password',
	])('redacts the address on /%s', (route) => {
		expect(redactEmailParams(`https://fabric.harper.fast/#/${route}?me=someone%40example.com`))
			.toBe(`https://fabric.harper.fast/#/${route}?me=<redacted>`);
	});

	it('redacts an unencoded address', () => {
		expect(redactEmailParams('https://fabric.harper.fast/#/sign-in?me=someone@example.com'))
			.toBe('https://fabric.harper.fast/#/sign-in?me=<redacted>');
	});

	it('redacts the param wherever it sits among others, and leaves the others alone', () => {
		expect(redactEmailParams('https://fabric.harper.fast/#/sign-up?utm_source=blog&me=someone%40example.com&plan=free'))
			.toBe('https://fabric.harper.fast/#/sign-up?utm_source=blog&me=<redacted>&plan=free');
	});

	it('redacts every occurrence', () => {
		expect(redactEmailParams('https://fabric.harper.fast/#/sign-in?me=a%40example.com&email=b%40example.com'))
			.toBe('https://fabric.harper.fast/#/sign-in?me=<redacted>&email=<redacted>');
	});

	// The auth links emit a bare `?me=` before an address has been typed; there is nothing to hide,
	// and rewriting it would only make the URL harder to recognise in Datadog.
	it('leaves an empty value as it is', () => {
		expect(redactEmailParams('https://fabric.harper.fast/#/sign-in?me='))
			.toBe('https://fabric.harper.fast/#/sign-in?me=');
	});

	it('leaves a param that merely ends in the matched name alone', () => {
		expect(redactEmailParams('https://fabric.harper.fast/#/apps?resume=step-2&username=someone'))
			.toBe('https://fabric.harper.fast/#/apps?resume=step-2&username=someone');
	});

	it('leaves a URL with no auth params untouched', () => {
		const url = 'https://fabric.harper.fast/#/org-1/clu-1/apps';
		expect(redactEmailParams(url)).toBe(url);
	});

	// A value class that admitted whitespace would run past the address and swallow the rest of the
	// stack — the address is not always at the end of the string it sits in.
	it('stops at the end of the URL when the address is quoted inside a multi-line stack', () => {
		const stack = [
			'Error: Failed to load route https://fabric.harper.fast/#/sign-in?me=someone%40example.com',
			'  at loadRoute @ https://fabric.harper.fast/assets/index-A1b2C3d4.js:5:1234',
		].join('\n');
		expect(redactEmailParams(stack)).toBe([
			'Error: Failed to load route https://fabric.harper.fast/#/sign-in?me=<redacted>',
			'  at loadRoute @ https://fabric.harper.fast/assets/index-A1b2C3d4.js:5:1234',
		].join('\n'));
	});

	it('stops at the fragment that follows the query', () => {
		expect(redactEmailParams('https://fabric.harper.fast/?me=someone%40example.com#/sign-in'))
			.toBe('https://fabric.harper.fast/?me=<redacted>#/sign-in');
	});

	it('leaves surrounding prose intact when the URL ends mid-sentence', () => {
		expect(redactEmailParams('Tried https://fabric.harper.fast/#/sign-in?me=someone%40example.com and gave up'))
			.toBe('Tried https://fabric.harper.fast/#/sign-in?me=<redacted> and gave up');
	});
});
