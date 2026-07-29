import { describe, expect, it } from 'vitest';
import { type DatadogErrorEvent, shouldKeepEvent } from './shouldKeepEvent';

function errorEvent(error: DatadogErrorEvent['error']): DatadogErrorEvent {
	return { type: 'error', error };
}

describe('shouldKeepEvent', () => {
	it('keeps non-error events', () => {
		expect(shouldKeepEvent({ type: 'view' })).toBe(true);
		expect(shouldKeepEvent({ type: 'resource' })).toBe(true);
	});

	it('keeps genuine application errors', () => {
		expect(shouldKeepEvent(errorEvent({ message: 'TypeError: x is not a function' }))).toBe(true);
	});

	it('discards aborted requests regardless of endpoint', () => {
		expect(shouldKeepEvent(errorEvent({ message: 'AxiosError: Request aborted' }))).toBe(false);
	});

	it('discards stray Fabric Connect breadcrumbs', () => {
		expect(shouldKeepEvent(errorEvent({ message: 'Fabric Connect not established' }))).toBe(false);
	});

	// Regression test for the browser-extension-injected "Object Not Found Matching Id"
	// error: a bare string (no stack) that a couple of extension-carrying sessions emit
	// hundreds of times, doubling total RUM error volume without indicating a Studio bug.
	it('discards browser-extension "Object Not Found Matching Id" errors', () => {
		expect(
			shouldKeepEvent(
				errorEvent({ message: 'Uncaught "Object Not Found Matching Id:1, MethodName:update, ParamCount:4"' }),
			),
		).toBe(false);
		expect(
			shouldKeepEvent(
				errorEvent({ message: 'Uncaught "Object Not Found Matching Id:2, MethodName:update, ParamCount:4"' }),
			),
		).toBe(false);
	});

	// Regression test for issue #1406: once a Monaco language worker fails to start
	// (stale deploy chunk, OOM tab), its main-thread fallback rejects every folding/
	// links/symbols/validation/code-action call with this message for the rest of the
	// session — dozens of echoes of a root cause that has its own RUM signal.
	it('discards Monaco "Missing requestHandler or method" worker-fallback spam', () => {
		expect(shouldKeepEvent(errorEvent({ message: 'Missing requestHandler or method: getFoldingRanges' }))).toBe(false);
		expect(shouldKeepEvent(errorEvent({ message: 'Missing requestHandler or method: doValidation' }))).toBe(false);
		expect(
			shouldKeepEvent(
				errorEvent({ message: 'Uncaught (in promise) Error: Missing requestHandler or method: findLinks' }),
			),
		).toBe(false);
	});

	// Regression test for issue #1371: handled AxiosError timeouts reach RUM via
	// console.error with no resource URL, so they must be discarded on the message alone.
	it('discards timeout errors even when no resource URL is present', () => {
		expect(shouldKeepEvent(errorEvent({ message: 'AxiosError: timeout of 60000ms exceeded' }))).toBe(false);
		expect(shouldKeepEvent(errorEvent({ message: 'timeout of 15000ms exceeded' }))).toBe(false);
	});

	it('discards timeout errors against instance/cluster resource URLs', () => {
		expect(
			shouldKeepEvent(
				errorEvent({
					message: 'timeout of 60000ms exceeded',
					resource: { url: 'https://api.harper.fast/HDBInstance/ins-123/operation' },
				}),
			),
		).toBe(false);
	});

	it('discards network failures against an instance/cluster operation endpoint', () => {
		expect(
			shouldKeepEvent(
				errorEvent({
					message: 'Network Error',
					resource: { url: 'https://api.harper.fast/Cluster/clu-123/operation' },
				}),
			),
		).toBe(false);
		expect(
			shouldKeepEvent(
				errorEvent({ source: 'network', resource: { url: 'https://api.harper.fast/HDBInstance/ins-9/operation' } }),
			),
		).toBe(false);
	});

	// Regression test for issue #1386: a session expiring / signing out mid-poll leaves
	// an in-flight request that 401s; these reach RUM as handled AxiosErrors with no URL.
	it('discards 401 auth failures on the message alone but keeps 403', () => {
		expect(shouldKeepEvent(errorEvent({ message: 'AxiosError: Request failed with status code 401' }))).toBe(false);
		// 403 = authenticated but forbidden; usually a UI authorization bug worth keeping.
		expect(shouldKeepEvent(errorEvent({ message: 'Request failed with status code 403' }))).toBe(true);
		// Word boundary guards against longer codes like 4010 being mistaken for 401.
		expect(shouldKeepEvent(errorEvent({ message: 'Request failed with status code 4010' }))).toBe(true);
	});

	it('discards 5xx errors against an instance/cluster operation endpoint', () => {
		expect(
			shouldKeepEvent(
				errorEvent({
					message: 'AxiosError: Request failed with status code 500',
					resource: { url: 'https://api.harper.fast/HDBInstance/ins-123/operation' },
				}),
			),
		).toBe(false);
	});

	it('keeps 5xx errors that are not attributable to an instance/cluster operation endpoint', () => {
		// An unattributed 5xx could be a genuine backend failure worth surfacing.
		expect(shouldKeepEvent(errorEvent({ message: 'Request failed with status code 500' }))).toBe(true);
		expect(
			shouldKeepEvent(
				errorEvent({
					message: 'Request failed with status code 502',
					resource: { url: 'https://api.harper.fast/Organization/org-1' },
				}),
			),
		).toBe(true);
	});

	// Regression tests for the Reo.dev analytics errors that reached Error Tracking on
	// 2026-07-28. Stacks below are the real ones RUM recorded, truncated.
	describe('third-party script errors', () => {
		it('discards errors thrown wholly inside the Reo.dev bundle', () => {
			expect(
				shouldKeepEvent(
					errorEvent({
						message: 'RangeError: Invalid time zone specified: Etc/Unknown',
						stack: [
							'RangeError: Invalid time zone specified: Etc/Unknown',
							'  at new DateTimeFormat @ <anonymous>',
							'  at r @ https://static.reo.dev/6565c3e84c377ad/177.reo.js:2:81872',
							'  at s.year @ https://static.reo.dev/6565c3e84c377ad/177.reo.js:2:82437',
						].join('\n'),
					}),
				),
			).toBe(false);
		});

		// The Datadog SDK patches `fetch`, so its bundle tops the stack of a beacon that
		// Reo.dev itself issued. That instrumentation frame must not make the error look
		// like Studio's own.
		it('discards third-party errors whose stack is topped by the Datadog fetch wrapper', () => {
			expect(
				shouldKeepEvent(
					errorEvent({
						message: 'Failed to fetch',
						stack: [
							'TypeError: Failed to fetch',
							'  at <anonymous> @ https://fabric.harper.fast/assets/vendor-datadog-DBn-aOxh.js:3:3213',
							'  at pn @ https://fabric.harper.fast/assets/vendor-datadog-DBn-aOxh.js:3:3396',
							'  at <anonymous> @ https://static.reo.dev/6565c3e84c377ad/reo.js:2:188638',
							'  at l @ https://static.reo.dev/6565c3e84c377ad/reo.js:2:180136',
						].join('\n'),
					}),
				),
			).toBe(false);
		});

		it('keeps errors with the same message when Studio code is on the stack', () => {
			expect(
				shouldKeepEvent(
					errorEvent({
						message: 'Failed to fetch',
						stack: [
							'TypeError: Failed to fetch',
							'  at <anonymous> @ https://fabric.harper.fast/assets/vendor-datadog-DBn-aOxh.js:3:3213',
							'  at getOrganization @ https://fabric.harper.fast/assets/index-A1b2C3d4.js:5:1234',
						].join('\n'),
					}),
				),
			).toBe(true);
		});

		it('keeps errors with no third-party frame at all', () => {
			expect(
				shouldKeepEvent(
					errorEvent({
						message: 'Uncaught "ResizeObserver loop completed with undelivered notifications."',
						stack: [
							'Error: ResizeObserver loop completed with undelivered notifications.',
							'  at undefined @ https://fabric.harper.fast/#/org-abc123',
						].join('\n'),
					}),
				),
			).toBe(true);
		});

		it('keeps errors with a stackless or frameless stack', () => {
			expect(shouldKeepEvent(errorEvent({ message: 'TypeError: x is not a function' }))).toBe(true);
			expect(
				shouldKeepEvent(errorEvent({ message: 'Boom', stack: 'Error: Boom\n  at <anonymous>' })),
			).toBe(true);
		});
	});

	it('keeps non-timeout network failures that are not attributable to an instance endpoint', () => {
		// Without an instance/cluster URL we cannot tell a real backend failure from an
		// expected one, so a bare "Network Error" stays visible (unlike timeouts).
		expect(shouldKeepEvent(errorEvent({ message: 'Network Error' }))).toBe(true);
		expect(
			shouldKeepEvent(
				errorEvent({ message: 'Network Error', resource: { url: 'https://api.harper.fast/Organization/org-1' } }),
			),
		).toBe(true);
	});
});
