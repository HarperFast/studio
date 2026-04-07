import { describe, expect, it } from 'vitest';
import { getSystemStatusById } from './getStatus';

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
