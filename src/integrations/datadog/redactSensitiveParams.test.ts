import { describe, expect, it } from 'vitest';
import { redactSensitiveParams } from './redactSensitiveParams';

describe('redactSensitiveParams', () => {
	// Studio uses hash routing, so the param lives in the fragment. A `URLSearchParams`-based
	// implementation reads an empty `search` here and would leave the address untouched.
	it('redacts an address carried in the hash-routed auth query', () => {
		expect(redactSensitiveParams('https://fabric.harper.fast/#/sign-in?me=someone%40example.com'))
			.toBe('https://fabric.harper.fast/#/sign-in?me=<redacted>');
	});

	it('redacts the post-sign-up verifying hand-off', () => {
		expect(redactSensitiveParams('https://fabric.harper.fast/#/verifying?email=someone%40example.com'))
			.toBe('https://fabric.harper.fast/#/verifying?email=<redacted>');
	});

	it.each([
		'sign-up',
		'forgot-password',
	])('redacts the address on /%s', (route) => {
		expect(redactSensitiveParams(`https://fabric.harper.fast/#/${route}?me=someone%40example.com`))
			.toBe(`https://fabric.harper.fast/#/${route}?me=<redacted>`);
	});

	it('redacts an unencoded address', () => {
		expect(redactSensitiveParams('https://fabric.harper.fast/#/sign-in?me=someone@example.com'))
			.toBe('https://fabric.harper.fast/#/sign-in?me=<redacted>');
	});

	it('redacts the param wherever it sits among others, and leaves the others alone', () => {
		expect(
			redactSensitiveParams('https://fabric.harper.fast/#/sign-up?utm_source=blog&me=someone%40example.com&plan=free'),
		)
			.toBe('https://fabric.harper.fast/#/sign-up?utm_source=blog&me=<redacted>&plan=free');
	});

	it('redacts every occurrence', () => {
		expect(redactSensitiveParams('https://fabric.harper.fast/#/sign-in?me=a%40example.com&email=b%40example.com'))
			.toBe('https://fabric.harper.fast/#/sign-in?me=<redacted>&email=<redacted>');
	});

	// The auth links emit a bare `?me=` before an address has been typed; there is nothing to hide,
	// and rewriting it would only make the URL harder to recognise in Datadog.
	it('leaves an empty value as it is', () => {
		expect(redactSensitiveParams('https://fabric.harper.fast/#/sign-in?me='))
			.toBe('https://fabric.harper.fast/#/sign-in?me=');
	});

	it('leaves a param that merely ends in the matched name alone', () => {
		expect(redactSensitiveParams('https://fabric.harper.fast/#/apps?resume=step-2&username=someone'))
			.toBe('https://fabric.harper.fast/#/apps?resume=step-2&username=someone');
	});

	it('leaves a URL with no auth params untouched', () => {
		const url = 'https://fabric.harper.fast/#/org-1/clu-1/apps';
		expect(redactSensitiveParams(url)).toBe(url);
	});

	// A value class that admitted whitespace would run past the address and swallow the rest of the
	// stack — the address is not always at the end of the string it sits in.
	it('stops at the end of the URL when the address is quoted inside a multi-line stack', () => {
		const stack = [
			'Error: Failed to load route https://fabric.harper.fast/#/sign-in?me=someone%40example.com',
			'  at loadRoute @ https://fabric.harper.fast/assets/index-A1b2C3d4.js:5:1234',
		].join('\n');
		expect(redactSensitiveParams(stack)).toBe([
			'Error: Failed to load route https://fabric.harper.fast/#/sign-in?me=<redacted>',
			'  at loadRoute @ https://fabric.harper.fast/assets/index-A1b2C3d4.js:5:1234',
		].join('\n'));
	});

	it('stops at the fragment that follows the query', () => {
		expect(redactSensitiveParams('https://fabric.harper.fast/?me=someone%40example.com#/sign-in'))
			.toBe('https://fabric.harper.fast/?me=<redacted>#/sign-in');
	});

	it('leaves surrounding prose intact when the URL ends mid-sentence', () => {
		expect(redactSensitiveParams('Tried https://fabric.harper.fast/#/sign-in?me=someone%40example.com and gave up'))
			.toBe('Tried https://fabric.harper.fast/#/sign-in?me=<redacted> and gave up');
	});

	// `encodeURIComponent` escapes neither `'` nor `(`/`)`/`!`/`~`/`*`, and all of them pass our
	// e-mail validator, so they reach the URL verbatim. Terminating the value on any of them would
	// leave the bulk of the address behind — a partial redaction that still identifies the person.
	it.each([
		["o'reilly@example.com", "o'reilly%40example.com"],
		["mary-jane.o'neill+tag@sub.example.co.uk", "mary-jane.o'neill%2Btag%40sub.example.co.uk"],
		["o'brien(work)@example.com", "o'brien(work)%40example.com"],
		['zed!~*@example.com', 'zed!~*%40example.com'],
	])('fully redacts %s, whose encoding keeps URL-terminating characters', (_address, encoded) => {
		expect(redactSensitiveParams(`https://fabric.harper.fast/#/verifying?email=${encoded}`))
			.toBe('https://fabric.harper.fast/#/verifying?email=<redacted>');
	});

	// The router's own serialiser percent-encodes the apostrophe; both spellings must redact whole.
	it('fully redacts the percent-encoded spelling of the same address', () => {
		expect(redactSensitiveParams('https://fabric.harper.fast/#/sign-in?me=o%27reilly%40example.com'))
			.toBe('https://fabric.harper.fast/#/sign-in?me=<redacted>');
	});

	// A double quote can't occur in an address `zodRequireEmail` accepts, so ending the value there
	// keeps a URL embedded in JSON from swallowing the fields after it.
	it('stops at a double quote so JSON around the URL survives', () => {
		expect(
			redactSensitiveParams('{"url":"https://fabric.harper.fast/#/sign-in?me=someone%40example.com","status":400}'),
		)
			.toBe('{"url":"https://fabric.harper.fast/#/sign-in?me=<redacted>","status":400}');
	});

	// The reverse trade: an apostrophe is valid in an address, so one wrapping the URL is consumed
	// rather than risk ending the value early.
	it('consumes an apostrophe wrapping the URL rather than ending the value at it', () => {
		expect(redactSensitiveParams(`Failed to load 'https://fabric.harper.fast/#/sign-in?me=someone%40example.com'`))
			.toBe(`Failed to load 'https://fabric.harper.fast/#/sign-in?me=<redacted>`);
	});

	// `token` is a live credential, not just an identifier: `ResetPassword` reads it from this query
	// and exchanges it for a password change, so a retained URL is an account takeover.
	it.each([
		'reset-password',
		'verify-email',
	])('redacts the reset token on /%s', (route) => {
		expect(redactSensitiveParams(`https://fabric.harper.fast/#/${route}?token=eyJhbGciOiJIUzI1NiJ9.abc-123_XY`))
			.toBe(`https://fabric.harper.fast/#/${route}?token=<redacted>`);
	});

	// A name list only covers the params someone remembered, so any param whose value holds an
	// address is redacted too — this one deep-links from a table keyed by e-mail.
	it('redacts an address inside a param no auth screen owns', () => {
		expect(
			redactSensitiveParams(
				'https://fabric.harper.fast/#/o/c/browse?filters=%7B%22email%22%3A%22user%40example.com%22%7D',
			),
		)
			.toBe('https://fabric.harper.fast/#/o/c/browse?filters=<redacted>');
	});

	it('leaves a param whose value holds no address alone', () => {
		const url = 'https://fabric.harper.fast/#/o/c/browse?filters=%7B%22id%22%3A%2242%22%7D&v=abc123';
		expect(redactSensitiveParams(url)).toBe(url);
	});

	// `redactErrorText` preserves the punctuation after a URL; this sibling shouldn't eat it either.
	it.each([
		['.', 'Failed at https://fabric.harper.fast/#/sign-in?me=user%40example.com. Retrying'],
		[';', 'Failed at https://fabric.harper.fast/#/sign-in?me=user%40example.com; retrying'],
	])('keeps a trailing %s outside the redaction', (_mark, text) => {
		expect(redactSensitiveParams(text)).toBe(text.replace(/me=[^\s]*?(?=[.;] )/, 'me=<redacted>'));
	});

	it('keeps a trailing comma outside the redaction', () => {
		expect(redactSensitiveParams('Failed at https://fabric.harper.fast/#/sign-in?me=user%40example.com, retrying'))
			.toBe('Failed at https://fabric.harper.fast/#/sign-in?me=<redacted>, retrying');
	});
});
