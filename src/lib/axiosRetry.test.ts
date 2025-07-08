import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axiosRetry } from './axiosRetry';
import * as sleepModule from './sleep';

vi.mock('./sleep', () => ({
	sleep: vi.fn().mockImplementation(() => {
		return Promise.resolve(true);
	}),
}));

describe('axiosRetry', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should be defined', () => {
		expect(axiosRetry).toBeDefined();
		expect(typeof axiosRetry).toBe('function');
	});

	it('should return the result if the request succeeds on first attempt', async () => {
		const mockResponse = { data: 'success' };
		const requestPromise = vi.fn().mockResolvedValue(mockResponse);

		const result = await axiosRetry(requestPromise);

		expect(result).toBe(mockResponse);
		expect(requestPromise).toHaveBeenCalledTimes(1);
		expect(sleepModule.sleep).not.toHaveBeenCalled();
	});

	it('should retry the request if it fails initially but succeeds later', async () => {
		const mockResponse = { data: 'success' };
		const requestPromise = vi.fn()
			.mockRejectedValueOnce(new Error('Request failed'))
			.mockResolvedValueOnce(mockResponse);

		const resultPromise = axiosRetry(requestPromise);

		await vi.runAllTimersAsync();

		const result = await resultPromise;

		expect(result).toBe(mockResponse);
		expect(requestPromise).toHaveBeenCalledTimes(2);
		expect(sleepModule.sleep).toHaveBeenCalledTimes(1);
		expect(sleepModule.sleep).toHaveBeenCalledWith(1000); // Default delay
	});

	it('should throw an error if retries is less than or equal to 0', async () => {
		const requestPromise = vi.fn();

		await expect(axiosRetry(requestPromise, 0)).rejects.toThrow('retries must be greater than 0');
		expect(requestPromise).not.toHaveBeenCalled();
	});
});
