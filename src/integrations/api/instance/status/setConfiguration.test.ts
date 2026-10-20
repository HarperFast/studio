import { describe, expect, it } from 'vitest';
import { shouldFanOutSetConfiguration } from './setConfiguration';

describe('shouldFanOutSetConfiguration', () => {
	it('is true when every live instance runs 5.2.0 or later', () => {
		expect(shouldFanOutSetConfiguration([
			{ status: 'RUNNING', version: '5.2.0' },
			{ status: 'RUNNING', version: '5.3.1' },
			{ status: 'STOPPED', version: '5.2.13' },
		])).toBe(true);
	});

	it('includes exactly 5.2.0', () => {
		expect(shouldFanOutSetConfiguration([
			{ status: 'RUNNING', version: '5.2.0' },
			{ status: 'RUNNING', version: '5.2.0' },
		])).toBe(true);
	});

	it('is false when any live instance is older', () => {
		expect(shouldFanOutSetConfiguration([
			{ status: 'RUNNING', version: '5.2.0' },
			{ status: 'RUNNING', version: '5.1.29' },
		])).toBe(false);
	});

	it('is false for a 5.2.0 prerelease', () => {
		expect(shouldFanOutSetConfiguration([
			{ status: 'RUNNING', version: '5.2.0' },
			{ status: 'RUNNING', version: '5.2.0-beta.4' },
		])).toBe(false);
	});

	it('is false when any live instance reports no version', () => {
		expect(shouldFanOutSetConfiguration([
			{ status: 'RUNNING', version: '5.2.0' },
			{ status: 'RUNNING', version: undefined },
		])).toBe(false);
	});

	it('ignores instances that are leaving the cluster', () => {
		expect(shouldFanOutSetConfiguration([
			{ status: 'RUNNING', version: '5.2.0' },
			{ status: 'STOPPED', version: '5.2.0' },
			{ status: 'TERMINATING', version: '5.1.29' },
			{ status: 'TERMINATED', version: undefined },
			{ status: 'REMOVED', version: '4.7.36' },
		])).toBe(true);
	});

	it('is false with nothing else live to reach', () => {
		expect(shouldFanOutSetConfiguration([])).toBe(false);
		expect(shouldFanOutSetConfiguration([{ status: 'RUNNING', version: '5.2.0' }])).toBe(false);
		expect(shouldFanOutSetConfiguration([
			{ status: 'RUNNING', version: '5.2.0' },
			{ status: 'TERMINATED', version: '5.2.0' },
		])).toBe(false);
	});
});
