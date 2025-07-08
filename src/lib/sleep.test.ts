import { describe, expect, it, vi } from 'vitest';
import { sleep } from './sleep';

describe('sleep', () => {
	it('should resolve after the specified time', async () => {
		const startTime = Date.now();
		await sleep(100);
		const endTime = Date.now();
		const elapsed = endTime - startTime;

		expect(elapsed).toBeGreaterThanOrEqual(90);
	});

	it('should use the default time of 1000ms if no time is specified', async () => {
		vi.useFakeTimers();
		const promise = sleep();
		vi.advanceTimersByTime(999);

		const resolved = await Promise.race([
			promise.then(() => true),
			Promise.resolve(false),
		]);
		expect(resolved).toBe(false);

		vi.advanceTimersByTime(1);

		await expect(promise).resolves.toBe(true);

		vi.useRealTimers();
	});
});
