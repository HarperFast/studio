import { describe, expect, it } from 'vitest';
import { SSEOperationError } from '../api/sse/errors';
import { redactRelayedMessage, redactRelayedStack } from './redactRelayedMessage';

const WITHHELD = 'Harper reported an operation failure (server message withheld).';

describe('redactRelayedMessage', () => {
	it('withholds a relayed message whatever shape the quoted input has', () => {
		// The three shapes seen in production in one week: an https remote, an scp remote, and a
		// shell command the customer pasted into the import field.
		expect(
			redactRelayedMessage('SSEOperationError', 'Failed to clone package https://github.com/acme-corp/billing: 128'),
		)
			.toBe(WITHHELD);
		expect(
			redactRelayedMessage(
				'SSEOperationError',
				'Failed to download package git@github.com:acme-corp/billing.git: ENOENT',
			),
		)
			.toBe(WITHHELD);
		expect(
			redactRelayedMessage(
				'SSEOperationError',
				'Failed to clone package github:gh repo clone acme-corp/billing: fatal: Too many arguments.',
			),
		).toBe(WITHHELD);
	});

	it('withholds a relayed message that quotes no reference at all', () => {
		// The rule is the error's origin, not its wording, so a message shape Harper has never
		// emitted before is covered without an edit here.
		expect(redactRelayedMessage('SSEOperationError', "ENOENT: no such file or directory, open '/tmp/x/package.json'"))
			.toBe(WITHHELD);
		expect(redactRelayedMessage('SSEOperationError', 'Something entirely new from a future Harper')).toBe(WITHHELD);
	});

	it('leaves every other error alone', () => {
		expect(redactRelayedMessage('AxiosError', 'Request failed with status code 403'))
			.toBe('Request failed with status code 403');
		expect(redactRelayedMessage('TypeError', 'x is not a function')).toBe('x is not a function');
		expect(redactRelayedMessage('SSEInconclusiveError', 'The stream went idle before completing.'))
			.toBe('The stream went idle before completing.');
		// RUM records no type for a thrown non-Error.
		expect(redactRelayedMessage(undefined, 'Failed to clone package github:acme-corp/billing: 128'))
			.toBe('Failed to clone package github:acme-corp/billing: 128');
	});

	it('keeps only the frames of a relayed stack', () => {
		// The production shape: the server message spans many lines above the frames, so a rule that
		// replaced just the first line would leave the rest — here the repository name is on line 1
		// and two kilobytes of `git clone` usage follow it.
		const stack = [
			'SSEOperationError: Failed to clone package github:gh repo clone acme-corp/billing: fatal: Too many arguments.',
			'',
			'usage: git clone [<options>] [--] <repo> [<dir>]',
			'    -v, --[no-]verbose    be more verbose',
			'',
			'  at Nv @ https://fabric.harper.fast/assets/index-DFE8mV3G.js:18:2240',
			'  at async Iv @ https://fabric.harper.fast/assets/index-DFE8mV3G.js:18:3162',
		].join('\n');
		expect(redactRelayedStack('SSEOperationError', stack)).toBe([
			`SSEOperationError: ${WITHHELD}`,
			'  at Nv @ https://fabric.harper.fast/assets/index-DFE8mV3G.js:18:2240',
			'  at async Iv @ https://fabric.harper.fast/assets/index-DFE8mV3G.js:18:3162',
		].join('\n'));
	});

	// `join('\r\n')` leaves the LAST element unterminated, so the frame under test has to sit in the
	// middle or the CRLF case silently tests nothing.
	it('matches frames on a CRLF stack', () => {
		const crlf = [
			'SSEOperationError: Failed to clone package github:acme-corp/billing: boom',
			'  at Nv @ https://fabric.harper.fast/assets/index-DFE8mV3G.js:18:2240',
			'  at async Iv @ https://fabric.harper.fast/assets/index-DFE8mV3G.js:18:3162',
		].join('\r\n');
		expect(redactRelayedStack('SSEOperationError', crlf)).toBe([
			`SSEOperationError: ${WITHHELD}`,
			'  at Nv @ https://fabric.harper.fast/assets/index-DFE8mV3G.js:18:2240\r',
			'  at async Iv @ https://fabric.harper.fast/assets/index-DFE8mV3G.js:18:3162',
		].join('\n'));
	});

	it('drops a message line that begins with "at" but names no script', () => {
		const stack = [
			'SSEOperationError: boom',
			'  at acme-corp/billing the clone failed',
			'  at Nv @ https://fabric.harper.fast/assets/index-DFE8mV3G.js:18:2240',
		].join('\n');
		expect(redactRelayedStack('SSEOperationError', stack)).toBe([
			`SSEOperationError: ${WITHHELD}`,
			'  at Nv @ https://fabric.harper.fast/assets/index-DFE8mV3G.js:18:2240',
		].join('\n'));
	});

	// The whole rule hinges on this one string matching what RUM records as `error.type`, and a
	// mismatch fails silently — `redactRelayedMessage` would return the server text unchanged with
	// every other test still green. The literal is what ships: minification rewrites the class name
	// but not the assignment in the constructor.
	it('matches the name SSEOperationError actually carries', () => {
		expect(new SSEOperationError('boom').name).toBe('SSEOperationError');
		expect(redactRelayedMessage(new SSEOperationError('boom').name, 'boom')).toBe(WITHHELD);
	});

	it('drops a relayed stderr line shaped like a frame but naming no script', () => {
		const stack = [
			'SSEOperationError: boom',
			'  at build step @ acme-corp/billing-service',
			'  at Nv @ https://fabric.harper.fast/assets/index-DFE8mV3G.js:18:2240',
		].join('\n');
		const redacted = redactRelayedStack('SSEOperationError', stack);
		expect(redacted).not.toContain('acme-corp');
		expect(redacted).toBe([
			`SSEOperationError: ${WITHHELD}`,
			'  at Nv @ https://fabric.harper.fast/assets/index-DFE8mV3G.js:18:2240',
		].join('\n'));
	});

	it('leaves the stack of every other error alone', () => {
		const stack = 'TypeError: x is not a function\n  at f @ https://fabric.harper.fast/assets/index.js:1:1';
		expect(redactRelayedStack('TypeError', stack)).toBe(stack);
		expect(redactRelayedStack(undefined, stack)).toBe(stack);
	});
});
