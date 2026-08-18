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
			view: { url: 'https://fabric.harper.fast/#/org-1/clu-1/apps' },
		};
		expect(beforeSend(event)).toBe(true);
		expect(event.view?.url).toBe('https://fabric.harper.fast/#/org-1/clu-1/apps');
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

	// A resource event carries its own URL, and `shouldKeepEvent` lets every non-error event
	// through, so this is the field an auth-screen request's address actually rides in.
	it("redacts the address from a resource event's own URL", () => {
		const event: DatadogErrorEvent = {
			type: 'resource',
			resource: { url: 'https://fabric.harper.fast/#/sign-in?me=someone%40example.com' },
		};
		expect(beforeSend(event)).toBe(true);
		expect(event.resource?.url).toBe('https://fabric.harper.fast/#/sign-in?me=<redacted>');
	});

	it('leaves a resource URL with no address in it untouched', () => {
		const event: DatadogErrorEvent = {
			type: 'resource',
			resource: { url: 'https://api.harper.fast/HDBInstance/ins-1/operation' },
		};
		expect(beforeSend(event)).toBe(true);
		expect(event.resource?.url).toBe('https://api.harper.fast/HDBInstance/ins-1/operation');
	});

	// The SDK swallows a throw from this hook and can't drop a view event at all, so a non-string
	// field must not take the redaction down mid-way and ship a half-redacted event.
	// The value has to stringify into something the pre-test matches but carry no `.replace`, or a
	// truthiness guard passes too: `WORTH_SCANNING.test(12345)` coerces, finds no separator, and
	// returns early without ever reaching the call that would throw.
	it('survives a non-string view URL instead of throwing', () => {
		const event = { type: 'view', view: { url: ['?me=a%40b.com'] } } as unknown as DatadogErrorEvent;
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

	// A failed request to a Harper host keeps its path through `redactErrorText`, so an address in
	// that path needs the URL pass, not the credential-params pass.
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

	// A throwing setter on a URL field escapes otherwise, and the SDK sends the event on a throw.
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
});
