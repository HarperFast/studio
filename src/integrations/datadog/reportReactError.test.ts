import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { addReactError } = vi.hoisted(() => ({ addReactError: vi.fn() }));
vi.mock('@datadog/browser-rum-react', () => ({ addReactError }));

let now = 0;
let reportReactError: typeof import('./reportReactError').reportReactError;
let reactRootErrorHandlers: typeof import('./reportReactError').reactRootErrorHandlers;

beforeEach(async () => {
	vi.resetModules();
	({ reportReactError, reactRootErrorHandlers } = await import('./reportReactError'));
	now = 1_000;
	vi.spyOn(performance, 'now').mockImplementation(() => now);
});

afterEach(() => {
	vi.restoreAllMocks();
	addReactError.mockReset();
});

const info = { componentStack: '\n    at OrgLayout\n    at Dashboard' };

function axiosError(url: string, message = 'Request failed with status code 403') {
	return Object.assign(new Error(message), {
		name: 'AxiosError',
		stack: `AxiosError: ${message}\n  at settle @ https://fabric.harper.fast/assets/index.js:1:1`,
		config: { method: 'get', baseURL: 'https://cm.example', url },
	});
}

describe('reportReactError', () => {
	it('reports one failure once however many times it is re-caught or re-thrown fresh', () => {
		const first = axiosError('/Organization/org-x');
		reportReactError(first, info);
		reportReactError(first, info);
		now += 378;
		reportReactError(axiosError('/Organization/org-x'), info);
		reportReactError(axiosError('/Organization/org-x'), info);

		expect(addReactError).toHaveBeenCalledTimes(1);
		expect(addReactError).toHaveBeenCalledWith(first, info);
	});

	it('reports the same failure again once the window since its last report has passed', () => {
		reportReactError(axiosError('/Organization/org-x'), info);
		now += 9_999;
		reportReactError(axiosError('/Organization/org-x'), info);
		now += 1;
		reportReactError(axiosError('/Organization/org-x'), info);

		expect(addReactError).toHaveBeenCalledTimes(2);
	});

	it.each([
		['message', axiosError('/Organization/org-x', 'Request failed with status code 500')],
		['endpoint', axiosError('/Organization/org-y')],
		['name', Object.assign(axiosError('/Organization/org-x'), { name: 'TypeError' })],
	])('reports a failure that differs only in its %s', (_label, other) => {
		reportReactError(axiosError('/Organization/org-x'), info);
		reportReactError(other, info);

		expect(addReactError).toHaveBeenCalledTimes(2);
	});

	it('reports the same error under a different component stack', () => {
		const error = axiosError('/Organization/org-x');
		reportReactError(error, info);
		reportReactError(error, { componentStack: '\n    at ClusterLayout' });

		expect(addReactError).toHaveBeenCalledTimes(2);
	});

	it('keeps thrown primitives of different types apart', () => {
		reportReactError('1', info);
		reportReactError(1, info);
		reportReactError(1, info);
		reportReactError(null, info);

		expect(addReactError).toHaveBeenCalledTimes(3);
	});

	it('still reports, without deduplicating, a value whose fields throw when read', () => {
		const hostile = new Proxy({}, {
			get() {
				throw new Error('getter trap');
			},
		});
		reportReactError(hostile, info);
		reportReactError(hostile, info);

		expect(addReactError).toHaveBeenCalledTimes(2);
	});

	it('swallows a report that threw, and does not remember it', () => {
		addReactError.mockImplementationOnce(() => {
			throw new Error('sdk failure');
		});
		expect(() => reportReactError(axiosError('/Organization/org-x'), info)).not.toThrow();
		reportReactError(axiosError('/Organization/org-x'), info);

		expect(addReactError).toHaveBeenCalledTimes(2);
	});

	it('still logs the original failure when the SDK throws while reporting it', () => {
		addReactError.mockImplementation(() => {
			throw new Error('sdk failure');
		});
		const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const error = axiosError('/Organization/org-x');

		expect(() => reactRootErrorHandlers.onCaughtError(error, info)).not.toThrow();
		expect(consoleWarn).toHaveBeenCalledWith('Caught error:', error, info);
	});

	it('forgets the oldest signature past its cap, so it is reported again', () => {
		reportReactError(axiosError('/Organization/org-0'), info);
		for (let index = 1; index <= 100; index++) {
			reportReactError(axiosError(`/Organization/org-${index}`), info);
		}
		reportReactError(axiosError('/Organization/org-100'), info);
		reportReactError(axiosError('/Organization/org-0'), info);

		expect(addReactError).toHaveBeenCalledTimes(102);
	});
});
