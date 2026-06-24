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
