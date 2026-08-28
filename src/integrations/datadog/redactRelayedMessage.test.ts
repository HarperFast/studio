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

	// Production shape: RUM's `message` already carries the `SSEOperationError: ` prefix, and the
	// stack is that message followed by the frames.
	// The rule hinges on this one literal matching what RUM records as `error.type`, and a mismatch
	// fails silently — the server text would ship with every other test still green. The literal is
	// what survives minification; the class name does not.
	it('matches the name SSEOperationError actually carries', () => {
		expect(new SSEOperationError('boom').name).toBe('SSEOperationError');
		expect(redactRelayedMessage(new SSEOperationError('boom').name, 'boom')).toBe(WITHHELD);
	});

	it('removes exactly the message and keeps what follows', () => {
		const message = [
			'SSEOperationError: Failed to clone package github:gh repo clone acme-corp/billing: fatal: Too many arguments.',
			'',
			'usage: git clone [<options>] [--] <repo> [<dir>]',
			'    -v, --[no-]verbose    be more verbose',
		].join('\n');
		const frames = [
			'',
			'  at Nv @ https://fabric.harper.fast/assets/index-DFE8mV3G.js:18:2240',
			'  at async Iv @ https://fabric.harper.fast/assets/index-DFE8mV3G.js:18:3162',
		].join('\n');
		expect(redactRelayedStack('SSEOperationError', message, message + frames)).toBe(WITHHELD + frames);
	});

	// The reason this removes a span instead of selecting frame-shaped lines: server text can be
	// shaped like a frame, and anything deciding line-by-line keeps it.
	it('removes frame-shaped text that the server put in the message', () => {
		const message = [
			'SSEOperationError: deploy failed',
			'  at acme-corp/billing @ https://scm.acme-corp.com/secret',
		].join('\n');
		const frames = '\n  at Nv @ https://fabric.harper.fast/assets/index-DFE8mV3G.js:18:2240';
		const redacted = redactRelayedStack('SSEOperationError', message, message + frames);
		expect(redacted).not.toContain('acme-corp');
		expect(redacted).toBe(WITHHELD + frames);
	});

	it('withholds the whole stack when it does not begin with the message', () => {
		expect(redactRelayedStack('SSEOperationError', 'SSEOperationError: boom', 'something else entirely'))
			.toBe(WITHHELD);
	});

	// A CRLF stack needs no special handling once the message is removed as one span, but the
	// message itself must then carry its own CRLFs to match.
	it('removes a CRLF message span intact', () => {
		const message = 'SSEOperationError: boom\r\ndetail: acme-corp/billing';
		const frames = '\r\n  at Nv @ https://fabric.harper.fast/assets/index-DFE8mV3G.js:18:2240';
		const redacted = redactRelayedStack('SSEOperationError', message, message + frames);
		expect(redacted).not.toContain('acme-corp');
		expect(redacted).toBe(WITHHELD + frames);
	});

	it('leaves the stack of every other error alone', () => {
		const message = 'TypeError: x is not a function';
		const stack = `${message}\n  at f @ https://fabric.harper.fast/assets/index.js:1:1`;
		expect(redactRelayedStack('TypeError', message, stack)).toBe(stack);
		expect(redactRelayedStack(undefined, message, stack)).toBe(stack);
	});
});
