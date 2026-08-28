import { describe, expect, it } from 'vitest';
import { beforeSend } from './beforeSend';
import { DatadogErrorEvent } from './shouldKeepEvent';

function errorEvent(error: DatadogErrorEvent['error']): DatadogErrorEvent {
	return { type: 'error', error };
}

describe('beforeSend', () => {
	it('drops the events shouldKeepEvent rejects', () => {
		expect(beforeSend(errorEvent({ message: 'AxiosError: Request failed with status code 401' }))).toBe(false);
	});

	it('withholds a relayed message but keeps the event and its own stack', () => {
		const event = errorEvent({
			type: 'SSEOperationError',
			message: 'Failed to clone package github:gh repo clone acme-corp/billing: fatal: Too many arguments.',
			stack: [
				'SSEOperationError: Failed to clone package github:gh repo clone acme-corp/billing',
				'  at deployComponentStream @ https://fabric.harper.fast/assets/index-A1b2C3d4.js:5:1234',
			].join('\n'),
		});
		expect(beforeSend(event)).toBe(true);
		expect(event.error?.message).toBe('Harper reported an operation failure (server message withheld).');
		expect(event.error?.message).not.toContain('acme-corp');
		// The stack is Studio's own frames, and `redactErrorText` still covers what it quotes.
		expect(event.error?.stack).not.toContain('acme-corp');
		expect(event.error?.stack).toContain('index-A1b2C3d4.js:5:1234');
	});

	it('redacts the repository path from a kept error message and stack', () => {
		const event = errorEvent({
			message: 'Failed to deploy git@github.com:acme-corp/billing-service.git: npm install failed',
			stack: [
				'Error: Failed to deploy git@github.com:acme-corp/billing-service.git',
				'  at deployComponentStream @ https://fabric.harper.fast/assets/index-A1b2C3d4.js:5:1234',
			].join('\n'),
		});
		expect(beforeSend(event)).toBe(true);
		expect(event.error?.message).toBe('Failed to deploy git@github.com:<redacted>: npm install failed');
		expect(event.error?.stack).toBe([
			'Error: Failed to deploy git@github.com:<redacted>',
			'  at deployComponentStream @ https://fabric.harper.fast/assets/index-A1b2C3d4.js:5:1234',
		].join('\n'));
	});

	it('redacts the repository path from the resource URL of a failed lookup', () => {
		const event = errorEvent({
			message: 'Request failed with status code 404',
			resource: { url: 'https://api.github.com/repos/acme-corp/billing-service' },
		});
		expect(beforeSend(event)).toBe(true);
		expect(event.error?.resource?.url).toBe('https://api.github.com/<redacted>');
	});

	// The endpoint is the whole point of a kept 5xx/network error, and it is Harper's own host.
	it('leaves an instance operation endpoint in the resource URL intact', () => {
		const event = errorEvent({
			message: 'Request failed with status code 403',
			resource: { url: 'https://api.harper.fast/HDBInstance/ins-1/operation' },
		});
		expect(beforeSend(event)).toBe(true);
		expect(event.error?.resource?.url).toBe('https://api.harper.fast/HDBInstance/ins-1/operation');
	});

	// The third-party attribution in `shouldKeepEvent` reads the raw stack, so filtering has to
	// happen before redaction could rewrite any frame in it.
	it('filters on the original stack rather than a redacted one', () => {
		expect(
			beforeSend(
				errorEvent({
					message: 'Failed to fetch',
					stack: [
						'TypeError: Failed to fetch',
						'  at <anonymous> @ https://static.reo.dev/6565c3e84c377ad/reo.js:2:188638',
					].join('\n'),
				}),
			),
		).toBe(false);
	});

	it('passes non-error events through untouched', () => {
		expect(beforeSend({ type: 'view' })).toBe(true);
	});

	// The auth screens keep a visitor's address in the URL for form persistence, and the SDK reads
	// `view.url` from `window.location`. Redaction has to reach non-error events too, since a view
	// or resource event on those screens carries the same address with no error attached.
	it('redacts the visitor address from the view URL and referrer of a view event', () => {
		const event: DatadogErrorEvent = {
			type: 'view',
			view: {
				url: 'https://fabric.harper.fast/#/sign-in?me=someone%40example.com',
				referrer: 'https://fabric.harper.fast/#/sign-up?me=someone%40example.com',
			},
		};
		expect(beforeSend(event)).toBe(true);
		expect(event.view?.url).toBe('https://fabric.harper.fast/#/sign-in?me=<redacted>');
		expect(event.view?.referrer).toBe('https://fabric.harper.fast/#/sign-up?me=<redacted>');
	});

	it('redacts the view URL of a resource event', () => {
		const event: DatadogErrorEvent = {
			type: 'resource',
			view: { url: 'https://fabric.harper.fast/#/verifying?email=someone%40example.com' },
		};
		expect(beforeSend(event)).toBe(true);
		expect(event.view?.url).toBe('https://fabric.harper.fast/#/verifying?email=<redacted>');
	});

	it('redacts the view URL of a kept error event alongside its message', () => {
		const event: DatadogErrorEvent = {
			type: 'error',
			error: { message: 'AxiosError: Request failed with status code 409' },
			view: { url: 'https://fabric.harper.fast/#/sign-up?me=someone%40example.com' },
		};
		expect(beforeSend(event)).toBe(true);
		expect(event.view?.url).toBe('https://fabric.harper.fast/#/sign-up?me=<redacted>');
	});

	it('leaves a view URL with no address in it untouched', () => {
		const event: DatadogErrorEvent = {
			type: 'view',
			view: { url: 'https://fabric.harper.fast/#/org-1/clu-1/apps?tab=overview&page=2' },
		};
		expect(beforeSend(event)).toBe(true);
		expect(event.view?.url).toBe('https://fabric.harper.fast/#/org-1/clu-1/apps?tab=overview&page=2');
	});

	// `redactErrorText` keeps the path for Harper-owned hosts on purpose, so an auth-screen URL
	// quoted in the error text would otherwise carry the address through that exemption.
	it('redacts the visitor address from a Harper host URL in the message, stack and handling stack', () => {
		const event = errorEvent({
			message: 'Failed to load route https://fabric.harper.fast/#/sign-in?me=someone%40example.com',
			stack: [
				'Error: Failed to load route https://fabric.harper.fast/#/sign-in?me=someone%40example.com',
				'  at loadRoute @ https://fabric.harper.fast/assets/index-A1b2C3d4.js:5:1234',
			].join('\n'),
			handling_stack:
				'HandlingStack: console error\n  at https://fabric.harper.fast/#/verifying?email=someone%40example.com',
		});
		expect(beforeSend(event)).toBe(true);
		expect(event.error?.message).toBe('Failed to load route https://fabric.harper.fast/#/sign-in?me=<redacted>');
		expect(event.error?.stack).toBe([
			'Error: Failed to load route https://fabric.harper.fast/#/sign-in?me=<redacted>',
			'  at loadRoute @ https://fabric.harper.fast/assets/index-A1b2C3d4.js:5:1234',
		].join('\n'));
		expect(event.error?.handling_stack).toBe(
			'HandlingStack: console error\n  at https://fabric.harper.fast/#/verifying?email=<redacted>',
		);
	});

	it('redacts the visitor address from a Harper host resource URL', () => {
		const event = errorEvent({
			message: 'Request failed with status code 409',
			resource: { url: 'https://api.harper.fast/User/?email=someone%40example.com' },
		});
		expect(beforeSend(event)).toBe(true);
		expect(event.error?.resource?.url).toBe('https://api.harper.fast/User/?email=<redacted>');
	});

	// Both redactions still compose: the non-Harper path goes, and so does the address.
	it('applies the host redaction and the address redaction together', () => {
		const event = errorEvent({
			message: 'Failed to reach https://scm.acme-corp.com/hooks?me=someone%40example.com',
		});
		expect(beforeSend(event)).toBe(true);
		expect(event.error?.message).toBe('Failed to reach https://scm.acme-corp.com/<redacted>');
	});

	it("redacts the address from a resource event's own URL", () => {
		const event: DatadogErrorEvent = {
			type: 'resource',
			resource: { url: 'https://fabric.harper.fast/#/sign-in?me=someone%40example.com' },
		};
		expect(beforeSend(event)).toBe(true);
		expect(event.resource?.url).toBe('https://fabric.harper.fast/#/sign-in?me=<redacted>');
	});

	// The query is what makes this meaningful: without a separator the redactor returns at its
	// pre-test, and the case would pass however the regexes behaved.
	it('leaves a resource URL with no address in it untouched', () => {
		const event: DatadogErrorEvent = {
			type: 'resource',
			resource: { url: 'https://api.harper.fast/HDBInstance/ins-1/operation?limit=10' },
		};
		expect(beforeSend(event)).toBe(true);
		expect(event.resource?.url).toBe('https://api.harper.fast/HDBInstance/ins-1/operation?limit=10');
	});

	// The value must stringify past `WORTH_SCANNING` yet carry no `.replace`, or a truthiness guard
	// passes too: `test(12345)` coerces, finds no separator, and returns before anything can throw.
	it.each([
		['view name', { type: 'view', view: { name: ['?me=a%40b.com'] } }],
		['view URL', { type: 'view', view: { url: ['?me=a%40b.com'] } }],
		['view referrer', { type: 'view', view: { referrer: ['?me=a%40b.com'] } }],
		['resource URL', { type: 'resource', resource: { url: ['?me=a%40b.com'] } }],
	] as [string, unknown][])('survives a non-string %s instead of throwing', (_field, raw) => {
		const event = raw as DatadogErrorEvent;
		expect(() => beforeSend(event)).not.toThrow();
		expect(beforeSend(event)).toBe(true);
	});

	it('redacts a reset token from the view URL', () => {
		const event: DatadogErrorEvent = {
			type: 'view',
			view: { url: 'https://fabric.harper.fast/#/reset-password?token=eyJhbGciOiJIUzI1NiJ9.abc' },
		};
		expect(beforeSend(event)).toBe(true);
		expect(event.view?.url).toBe('https://fabric.harper.fast/#/reset-password?token=<redacted>');
	});

	// The URL redaction must already have happened before anything downstream can throw: the SDK
	// swallows a throw and sends the event regardless, and a view event can't be dismissed at all.
	// A throwing getter is what actually forces that, now that the filter itself is type-safe.
	it('has already redacted the view URL when the filter throws', () => {
		const event = {
			type: 'error',
			view: { url: 'https://fabric.harper.fast/#/reset-password?token=abc.def' },
			get error(): never {
				throw new Error('malformed event');
			},
		} as unknown as DatadogErrorEvent;
		expect(beforeSend(event)).toBe(false);
		expect(event.view?.url).toBe('https://fabric.harper.fast/#/reset-password?token=<redacted>');
	});

	// `redactErrorText` keeps a Harper host's path, so this needs the URL pass, not the text pass.
	it("redacts an address in a failed request's URL path", () => {
		const event: DatadogErrorEvent = {
			type: 'error',
			error: {
				message: 'Request failed with status code 500',
				resource: { url: 'https://api.harper.fast/config/users/someone%40example.com' },
			},
		};
		expect(beforeSend(event)).toBe(true);
		expect(event.error?.resource?.url).toBe('https://api.harper.fast/config/users/<redacted>');
	});

	// The ambiguous label separator this replaced took 8.7s at 30 characters.
	it('does not backtrack on a long hyphenated token with no dot-TLD', () => {
		const event: DatadogErrorEvent = {
			type: 'view',
			view: { url: `https://fabric.harper.fast/#/o/c/apps?u=git@${'-a'.repeat(40)}` },
		};
		const started = performance.now();
		expect(beforeSend(event)).toBe(true);
		expect(performance.now() - started).toBeLessThan(100);
	});

	it('drops the event when a URL field throws instead of letting it escape', () => {
		const event = {
			type: 'resource',
			view: {
				get url(): string {
					throw new Error('hostile getter');
				},
			},
		} as unknown as DatadogErrorEvent;
		expect(() => beforeSend(event)).not.toThrow();
		expect(beforeSend(event)).toBe(false);
	});

	// Pins `shouldKeepEvent`'s type checks rather than `beforeSend`'s: a non-string message sails
	// past the leading `.test()` calls, which coerce, and reaches a `.includes` that would throw.
	// Under `?? ''` that throw is caught here and the event is dropped instead of kept.
	it('keeps an event whose message is not a string', () => {
		const event = { type: 'error', error: { message: 12345 } } as unknown as DatadogErrorEvent;
		expect(beforeSend(event)).toBe(true);
	});

	// Each field is read twice, by the filter and by the redaction, so one case pins both guards. The
	// 5xx message makes the filter coerce `resource.url`: under `?? ''` the array stringifies into an
	// instance endpoint and the event is silently dropped rather than kept.
	it.each([
		'stack',
		'handling_stack',
		'resource',
	])('keeps an event whose %s is not a string', (field) => {
		const malformed = ['https://api.harper.fast/HDBInstance/ins-1/operation'];
		const event = {
			type: 'error',
			error: {
				message: 'Request failed with status code 500',
				[field]: field === 'resource' ? { url: malformed } : malformed,
			},
		} as unknown as DatadogErrorEvent;
		expect(() => beforeSend(event)).not.toThrow();
		expect(beforeSend(event)).toBe(true);
	});

	it('redacts an address from the view name', () => {
		const event: DatadogErrorEvent = {
			type: 'view',
			view: { name: '/o/c/config/users/someone%40example.com/' },
		};
		expect(beforeSend(event)).toBe(true);
		expect(event.view?.name).toBe('/o/c/config/users/<redacted>/');
	});

	it('leaves a parameterised view name untouched', () => {
		const event: DatadogErrorEvent = {
			type: 'view',
			view: { name: '/$organizationId/$clusterId/config/users/$username/' },
		};
		expect(beforeSend(event)).toBe(true);
		expect(event.view?.name).toBe('/$organizationId/$clusterId/config/users/$username/');
	});
});
