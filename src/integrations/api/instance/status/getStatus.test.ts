import type { AxiosInstance } from 'axios';
import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { getStatusQueryOptions, getSystemStatusById, predatesGetStatus, supportsGetStatus } from './getStatus';

/** The subset of `Query` the `refetchInterval` callback reads. */
type ErrorStateQuery = { state: { error: unknown } };

function httpError(status: number): AxiosError {
	const err = new AxiosError(`Request failed with status code ${status}`);
	err.response = { status } as AxiosError['response'];
	return err;
}

describe('getStatusQueryOptions polling', () => {
	function refetchIntervalFor(error: unknown) {
		const { refetchInterval } = getStatusQueryOptions({
			entityId: 'ins-test' as never,
			instanceClient: {} as AxiosInstance,
		}, true);
		// The option is a function so it can consult the query's error state.
		expect(typeof refetchInterval).toBe('function');
		const resolve = refetchInterval as unknown as (q: ErrorStateQuery) => number | false;
		return resolve({ state: { error } });
	}

	const axiosErrorWithStatus = httpError;

	it('polls every 10s while healthy', () => {
		expect(refetchIntervalFor(null)).toBe(10_000);
	});

	it('stops polling after a 403 so it cannot loop forever (RUM 2026-07-27)', () => {
		expect(refetchIntervalFor(axiosErrorWithStatus(403))).toBe(false);
	});

	it('keeps polling after a recoverable 5xx', () => {
		expect(refetchIntervalFor(axiosErrorWithStatus(503))).toBe(10_000);
	});
});

describe('getSystemStatusById', () => {
	it('returns the status for a given id when it exists', () => {
		const mockStatusResponse = {
			systemStatus: [
				{
					id: 'availability',
					status: 'Available',
					__updatedtime__: 123456789,
					__createdtime__: 123456780,
				},
				{
					id: 'maintenance',
					status: 'Unavailable',
					__updatedtime__: 123456790,
					__createdtime__: 123456780,
				},
			],
			restartRequired: false,
			componentStatus: [],
		};

		expect(getSystemStatusById(mockStatusResponse, 'availability')).toBe('Available');
		expect(getSystemStatusById(mockStatusResponse, 'maintenance')).toBe('Unavailable');
	});

	it('returns undefined if statusResponse is undefined', () => {
		expect(getSystemStatusById(undefined, 'availability')).toBeUndefined();
	});

	it('returns undefined if systemStatus array is missing', () => {
		// @ts-expect-error - testing invalid input
		expect(getSystemStatusById({}, 'availability')).toBeUndefined();
	});

	it('returns undefined if the id is not found in systemStatus', () => {
		const mockStatusResponse = {
			systemStatus: [
				{
					id: 'availability',
					status: 'Available',
					__updatedtime__: 123456789,
					__createdtime__: 123456780,
				},
			],
			restartRequired: false,
			componentStatus: [],
		};

		expect(getSystemStatusById(mockStatusResponse, 'non-existent')).toBeUndefined();
	});

	it('returns undefined if systemStatus is empty', () => {
		const mockStatusResponse = {
			systemStatus: [],
			restartRequired: false,
			componentStatus: [],
		};

		expect(getSystemStatusById(mockStatusResponse, 'availability')).toBeUndefined();
	});
});

describe('get_status version floor', () => {
	it('supports Harper 4.6.0 and later, and nothing unknown', () => {
		for (const version of ['4.6.0', '4.7.3', '5.0.2']) {
			expect(supportsGetStatus(version)).toBe(true);
		}
		for (const version of ['4.5.12', '', undefined, 'custom-build']) {
			expect(supportsGetStatus(version)).toBe(false);
		}
	});

	it('says a version predates get_status only when it parses and is older', () => {
		expect(predatesGetStatus('4.5.12')).toBe(true);
		expect(predatesGetStatus('4.6.0-beta.3')).toBe(true);
		for (const version of ['4.6.0', '5.0.2', '', undefined, 'custom-build']) {
			expect(predatesGetStatus(version)).toBe(false);
		}
	});
});
