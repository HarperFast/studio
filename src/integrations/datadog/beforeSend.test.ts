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
});
