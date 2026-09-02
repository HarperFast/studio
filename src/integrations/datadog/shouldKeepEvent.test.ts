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

	// Regression tests for issue #1670. Fixtures are the verbatim RUM shapes of the burst.
	describe('Monaco WebKit clipboard workaround', () => {
		const canceledStack = [
			'Canceled: Canceled',
			'  at cancel @ https://fabric.harper.fast/assets/register-Ba2f4Dew.js:11:237322',
			'  at e @ https://fabric.harper.fast/assets/register-Ba2f4Dew.js:381:78517',
			'  at dispatchEvent @ [native code]',
			'  at _fillTextControl @ undefined',
		].join('\n');
		const monacoLoggedNotAllowed =
			'%c  ERR color: #f33 NotAllowedError: The request is not allowed by the user agent or the platform '
			+ 'in the current context, possibly because the user denied permission.';

		it("discards Monaco's unhandled CancellationError", () => {
			expect(shouldKeepEvent(errorEvent({ type: 'Canceled', message: 'Canceled', stack: canceledStack }))).toBe(
				false,
			);
			expect(shouldKeepEvent(errorEvent({ type: 'Canceled', message: 'Canceled\r' }))).toBe(false);
		});

		it('keeps a cancellation that says what was cancelled', () => {
			expect(shouldKeepEvent(errorEvent({ type: 'Canceled', message: 'Deploy step 3 Canceled' }))).toBe(true);
			expect(
				shouldKeepEvent(errorEvent({ type: 'Canceled', message: 'Canceled: the deploy was stopped by the user' })),
			).toBe(true);
			expect(shouldKeepEvent(errorEvent({ type: 'Error', message: 'Deployment Canceled' }))).toBe(true);
			expect(shouldKeepEvent(errorEvent({ type: 'CancelledError', message: 'CancelledError' }))).toBe(true);
		});

		it("discards Monaco's logged clipboard permission refusal", () => {
			expect(
				shouldKeepEvent(errorEvent({ type: 'NotAllowedError', source: 'console', message: monacoLoggedNotAllowed })),
			).toBe(false);
			expect(
				shouldKeepEvent(
					errorEvent({
						type: 'NotAllowedError',
						source: 'console',
						message: '%c  ERR color: #f33 NotAllowedError: Write permission denied.',
					}),
				),
			).toBe(false);
		});

		it('keeps a permission refusal that Monaco did not log', () => {
			const refusal =
				'NotAllowedError: The request is not allowed by the user agent or the platform in the current context.';
			expect(shouldKeepEvent(errorEvent({ type: 'NotAllowedError', source: 'console', message: refusal }))).toBe(true);
			expect(shouldKeepEvent(errorEvent({ type: 'NotAllowedError', source: 'source', message: refusal }))).toBe(true);
			expect(
				shouldKeepEvent(errorEvent({ type: 'NotAllowedError', message: 'NotAllowedError: ERR_PERMISSION_DENIED' })),
			).toBe(true);
		});

		it('keeps an error that only mentions NotAllowedError in its text', () => {
			expect(
				shouldKeepEvent(errorEvent({ type: 'TypeError', message: 'Failed to map a NotAllowedError to a toast' })),
			).toBe(true);
		});
	});

	// Regression test for issue #1371: handled AxiosError timeouts reach RUM via
	// console.error with no resource URL, so they cannot be attributed to an endpoint.
	it('discards timeout errors even when no resource URL is present', () => {
		expect(
			shouldKeepEvent(errorEvent({ type: 'AxiosError', message: 'AxiosError: timeout of 60000ms exceeded' })),
		).toBe(false);
		expect(shouldKeepEvent(errorEvent({ type: 'AxiosError', message: 'timeout of 15000ms exceeded' }))).toBe(false);
	});

	it('discards the bare "timeout exceeded" spelling', () => {
		expect(shouldKeepEvent(errorEvent({ type: 'AxiosError', message: 'AxiosError: timeout exceeded' }))).toBe(false);
		expect(shouldKeepEvent(errorEvent({ type: 'AxiosError', message: 'timeout exceeded' }))).toBe(false);
	});

	// Only the thrown value's name separates a Harper-composed operation failure from Axios'
	// bare spelling.
	it('keeps a non-Axios failure whose message is a timeout phrase', () => {
		expect(
			shouldKeepEvent(
				errorEvent({ type: 'SSEOperationError', message: 'SSEOperationError: Operation timeout exceeded' }),
			),
		).toBe(true);
		expect(
			shouldKeepEvent(
				errorEvent({ type: 'Error', message: 'Error: component install timeout exceeded, rolling back' }),
			),
		).toBe(true);
		expect(
			shouldKeepEvent(
				errorEvent({ type: 'Error', message: 'Error: Database connection pool timeout exceeded the threshold' }),
			),
		).toBe(true);
	});

	// `src/main.tsx`'s root handlers log `console.error('Caught error:', error, errorInfo)`. The SDK
	// joins every param into `error.message` but takes `error.type` from the Error param alone, so
	// the appended component stack cannot defeat the name gate the way it would a message anchor.
	it('discards a timeout relayed through a React root error handler', () => {
		expect(
			shouldKeepEvent(errorEvent({
				type: 'AxiosError',
				message: 'Caught error: AxiosError: timeout exceeded {"componentStack":"\\n    at Suspense"}',
			})),
		).toBe(false);
	});

	// The name gate above deliberately does not fire for a nameless timeout, so this is the only
	// thing dropping the tracked *resource* errors, which need not carry `type: 'AxiosError'`.
	it('discards timeout errors against instance/cluster resource URLs, in either spelling', () => {
		expect(
			shouldKeepEvent(
				errorEvent({
					message: 'timeout of 60000ms exceeded',
					resource: { url: 'https://api.harper.fast/HDBInstance/ins-123/operation' },
				}),
			),
		).toBe(false);
		expect(
			shouldKeepEvent(
				errorEvent({
					message: 'timeout exceeded',
					resource: { url: 'https://api.harper.fast/Cluster/clu-123/operation' },
				}),
			),
		).toBe(false);
	});

	// Pins that the name gate only ever adds drops: the numeric spelling is still dropped without
	// a name, so a timeout Studio re-wraps into a plain `Error` (`secrets.ts`) behaves as before,
	// while the bare spelling — indistinguishable from prose without a name — is reported.
	it('gates only the bare spelling on the error name', () => {
		expect(shouldKeepEvent(errorEvent({ message: 'timeout of 60000ms exceeded' }))).toBe(false);
		expect(shouldKeepEvent(errorEvent({ type: 'Error', message: 'AxiosError: timeout of 60000ms exceeded' })))
			.toBe(false);
		expect(shouldKeepEvent(errorEvent({ message: 'timeout exceeded' }))).toBe(true);
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

	// The instance couldn't authenticate to the customer's private repo over SSH — an instance
	// configuration state (no key, key without access, host missing from known_hosts), not a
	// Studio bug. 8 events from one session in the 24h to 2026-07-30 opened an Error Tracking
	// issue for it; the deploy UI already shows Harper's remediation text plus a link to
	// Config > SSH Keys. Dropping it also keeps the embedded private repo URL out of Datadog.
	it('discards private-repository deploy failures', () => {
		expect(
			shouldKeepEvent(
				errorEvent({
					message:
						'Failed to deploy private repository git@github.com:acme-corp/billing-service.git: SSH access failed. '
						+ 'Verify the repository URL, configure an SSH key on this Harper instance, ensure the key has access to '
						+ 'the target repository, and confirm the host is present in the ssh/known_hosts file.',
				}),
			),
		).toBe(false);
		// Matched on the prefix, so a reworded remediation sentence still drops.
		expect(
			shouldKeepEvent(
				errorEvent({ message: 'Failed to deploy private repository https://github.com/acme-corp/app: auth rejected' }),
			),
		).toBe(false);
		// A public-package deploy failure is a different animal — keep it.
		expect(shouldKeepEvent(errorEvent({ message: 'Failed to deploy component: invalid package' }))).toBe(true);
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

		// Pins the premise of the `.catch` in `src/integrations/reo/reo.ts`: the loader rejects
		// from the injected script's `onerror`, so the only located frame is Studio's bundle and
		// this filter cannot suppress it.
		it('keeps the Reo loader rejection, whose only frame is the Studio bundle', () => {
			expect(
				shouldKeepEvent(
					errorEvent({
						message: 'Failed to load the JS script of the agent',
						stack: [
							'Error: Failed to load the JS script of the agent',
							'  at r.onerror @ https://fabric.harper.fast/assets/index-DFE8mV3G.js:3:5781',
						].join('\n'),
					}),
				),
			).toBe(true);
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

	// Regression tests for #1645. Stacks below are the real ones RUM recorded, truncated.
	describe('browser extension content scripts', () => {
		it('discards errors whose stack is nothing but extension frames', () => {
			expect(
				shouldKeepEvent(
					errorEvent({
						message: "Cannot read properties of undefined (reading 'M_ID')",
						stack: [
							"TypeError: Cannot read properties of undefined (reading 'M_ID')",
							'  at Z @ chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/js/inject.js:1:24680',
							'  at f @ chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/js/inject.js:1:23104',
						].join('\n'),
					}),
				),
			).toBe(false);
		});

		// Not an enumeration of the schemes that exist — `ms-browser-extension` and any future
		// spelling must attribute the same way, or they score as Studio frames instead.
		it.each([
			'moz-extension',
			'safari-web-extension',
			'safari-extension',
			'ms-browser-extension',
			'edge-extension',
		])(
			'discards errors from %s frames',
			(scheme) => {
				expect(
					shouldKeepEvent(
						errorEvent({
							message: 'Boom',
							stack: ['TypeError: Boom', `  at h @ ${scheme}://abc-123/content.js:1:10`].join('\n'),
						}),
					),
				).toBe(false);
			},
		);

		// An extension can call into Studio code (a patched event handler, a click it
		// synthesises). Once one of our frames is on the stack the error is ours to answer for,
		// so the extension frame must not be enough on its own to drop it.
		it('keeps errors with a Studio frame alongside the extension frames', () => {
			expect(
				shouldKeepEvent(
					errorEvent({
						message: "Cannot read properties of undefined (reading 'M_ID')",
						stack: [
							"TypeError: Cannot read properties of undefined (reading 'M_ID')",
							'  at Z @ chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/js/inject.js:1:24680',
							'  at useOrganization @ https://fabric.harper.fast/assets/index-A1b2C3d4.js:5:1234',
						].join('\n'),
					}),
				),
			).toBe(true);
		});

		// The message line is not a frame. A Studio error that merely quotes an extension URL
		// must not be attributed to the extension.
		it('keeps errors whose only extension mention is in the message text', () => {
			expect(
				shouldKeepEvent(
					errorEvent({
						message: 'Failed to load chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/js/inject.js',
						stack: [
							'TypeError: Failed to load chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/js/inject.js',
							'  at loadScript @ [native code]',
						].join('\n'),
					}),
				),
			).toBe(true);
		});

		// Only the frame's URL field decides its origin, so an extension URL sitting in the
		// function-name half of a Studio frame must not attribute the frame to the extension.
		it("keeps errors whose extension URL is in a Studio frame's function name", () => {
			expect(
				shouldKeepEvent(
					errorEvent({
						message: 'Boom',
						stack: [
							'TypeError: Boom',
							'  at chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/js/inject.js @ https://fabric.harper.fast/assets/index-A1b2C3d4.js:5:1234',
						].join('\n'),
					}),
				),
			).toBe(true);
		});

		// A Studio frame's URL is not always plain https: Monaco's language workers run from
		// `blob:https://…`. The nested origin is what attributes the frame, so such a frame must
		// still count as ours even with an extension frame beside it.
		it('keeps errors with a blob-URL Studio frame alongside the extension frames', () => {
			expect(
				shouldKeepEvent(
					errorEvent({
						message: 'Boom',
						stack: [
							'TypeError: Boom',
							'  at s @ chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/js/inject.js:1:900',
							'  at run @ blob:https://fabric.harper.fast/9f0e5d1c-uuid:1:1',
						].join('\n'),
					}),
				),
			).toBe(true);
		});

		// The scheme only means anything at the start of the URL. A Studio script whose own URL
		// carries an extension URL in a query or hash is still Studio's frame.
		it('keeps errors whose Studio frame URL embeds an extension URL in a query param', () => {
			expect(
				shouldKeepEvent(
					errorEvent({
						message: 'Boom',
						stack: [
							'TypeError: Boom',
							'  at s @ chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/js/inject.js:1:900',
							'  at go @ https://fabric.harper.fast/assets/index-A1b2C3d4.js?redirect=chrome-extension://abcdef/login.html:5:1234',
						].join('\n'),
					}),
				),
			).toBe(true);
		});

		// A CRLF-terminated stack leaves a trailing `\r` on every line after the `\n` split. It has
		// to be tolerated at the frame level, because a frame that fails to parse is skipped as
		// unlocatable — so one stray `\r` would silently disable attribution for the whole stack.
		it('discards extension-only stacks with CRLF line endings', () => {
			expect(
				shouldKeepEvent(
					errorEvent({
						message: "Cannot read properties of undefined (reading 'M_ID')",
						stack: [
							"TypeError: Cannot read properties of undefined (reading 'M_ID')",
							'  at Z @ chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/js/inject.js:1:24680',
						].join('\r\n') + '\r\n',
					}),
				),
			).toBe(false);
		});

		// A message can embed a whole foreign-format stack — Monaco's DI errors carry a V8-native
		// one, four-space indented and parenthesised. Those lines hold first-party URLs but are
		// text, not frames; matching a URL anywhere on the line would read them as Studio frames.
		it('does not read a V8-native stack embedded in the message as frames', () => {
			expect(
				shouldKeepEvent(
					errorEvent({
						message: '[createInstance] Fm depends on UNKNOWN service ICodeLensCache.',
						stack: [
							'Error: [createInstance] Fm depends on UNKNOWN service ICodeLensCache.',
							'',
							'Error: [createInstance] Fm depends on UNKNOWN service ICodeLensCache.',
							'    at e._createInstance (https://fabric.harper.fast/assets/editor.api-OBQnf1nL.js:817:2045)',
							'    at kP._instantiateById (https://fabric.harper.fast/assets/editor.api-OBQnf1nL.js:240:40224)',
							'  at s @ chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/js/inject.js:1:900',
						].join('\n'),
					}),
				),
			).toBe(false);
		});

		// Pins the trade-off reviewed on #1646: a frame the browser could not resolve carries no
		// URL, so it cannot be attributed and is skipped rather than assumed to be ours. An error
		// whose *only* frames are unresolvable is therefore dropped when an extension frame sits
		// beside them. Measured against 14 days of RUM (4,475 events) this shape never occurred,
		// and the safer alternative — treating an unresolvable frame as Studio's — would readmit
		// most of the flood, since extension stacks routinely carry a `[native code]` frame.
		it('drops an extension stack whose only other frames are unresolvable', () => {
			expect(
				shouldKeepEvent(
					errorEvent({
						message: 'Boom',
						stack: [
							'TypeError: Boom',
							'  at handle @ chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/js/inject.js:1:900',
							'  at dispatchEvent @ [native code]',
							'  at a.onload @ <anonymous>:1:256',
						].join('\n'),
					}),
				),
			).toBe(false);
		});

		it('discards extension errors whose stack is topped by the Datadog fetch wrapper', () => {
			expect(
				shouldKeepEvent(
					errorEvent({
						message: 'Failed to fetch',
						stack: [
							'TypeError: Failed to fetch',
							'  at <anonymous> @ https://fabric.harper.fast/assets/vendor-datadog-DBn-aOxh.js:3:3213',
							'  at s @ chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/js/inject.js:1:900',
						].join('\n'),
					}),
				),
			).toBe(false);
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
