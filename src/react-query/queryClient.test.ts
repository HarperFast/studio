import { ImportJobError, ImportJobUnconfirmedError } from '@/integrations/api/instance/database/getJob';
import {
	RESTART_UNCONFIRMED_MESSAGE,
	RESTART_UNCONFIRMED_TITLE,
	RestartUnconfirmedError,
} from '@/integrations/api/instance/status/restartUnconfirmed';
import { OUTCOME_UNKNOWN_TITLE, UNANSWERED_WRITE_MESSAGE } from '@/integrations/api/unansweredWrite';
import { markRestarting, resetRestartTracker } from '@/lib/restart/restartTracker';
import { MutationObserver, QueryObserver } from '@tanstack/react-query';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { describeError, errorHandler, queryClient, queryErrorHandler, shouldToastOwnFailure } from './queryClient';
import { claimForRoute } from './routeQueryClaims';

// Mock the toast module
vi.mock('sonner', () => ({
	toast: {
		error: vi.fn().mockReturnValue({
			dismiss: vi.fn(),
		}),
		dismiss: vi.fn(),
	},
}));

describe('errorHandler', () => {
	let consoleMock: MockInstance<Console['error']>;

	beforeEach(() => {
		vi.clearAllMocks();
		consoleMock = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		// mockRestore (not mockReset) un-installs the spy so the global
		// render-phase-update tripwire's console.error wrapper is back in place
		// at teardown — mockReset leaves a swallowing no-op spy installed, which
		// the tripwire self-check (failOnRenderPhaseUpdate #1520) flags.
		consoleMock.mockRestore();
	});

	it('should display default error message when no specific error info is available', () => {
		// Call errorHandler with a generic error
		errorHandler(new Error());
		expect(consoleMock).toHaveBeenCalled();

		// Verify toast.error was called with the default message
		expect(toast.error).toHaveBeenCalledWith('Error', {
			description: 'We had some trouble!',
			action: {
				label: 'Dismiss',
				onClick: expect.any(Function),
			},
		});
	});

	it('should display error message from axios error.response.data.error', () => {
		// Create a mock Axios error with error property
		const axiosError = {
			response: {
				data: {
					error: 'Specific API error message',
				},
			},
		} as AxiosError<{ error?: string; message?: string }>;

		// Call errorHandler with the axios error
		errorHandler(axiosError);

		// Verify toast.error was called with the specific error message
		expect(toast.error).toHaveBeenCalledWith('Error', {
			description: 'Specific API error message',
			action: {
				label: 'Dismiss',
				onClick: expect.any(Function),
			},
		});
	});

	it('should display a string error message', () => {
		// Call errorHandler with a generic error
		errorHandler('String error message');

		// Verify toast.error was called with the default message
		expect(toast.error).toHaveBeenCalledWith('Error', {
			description: 'String error message',
			action: {
				label: 'Dismiss',
				onClick: expect.any(Function),
			},
		});
	});

	it('should display error message from axios error.response.data.message', () => {
		// Create a mock Axios error with message property
		const axiosError = {
			response: {
				data: {
					message: 'API message error',
				},
			},
		} as AxiosError<{ error?: string; message?: string }>;

		// Call errorHandler with the axios error
		errorHandler(axiosError);

		// Verify toast.error was called with the specific error message
		expect(toast.error).toHaveBeenCalledWith('Error', {
			description: 'API message error',
			action: {
				label: 'Dismiss',
				onClick: expect.any(Function),
			},
		});
	});

	// Feature code (e.g. the Import Data modal) intentionally has no per-mutation onError:
	// the MutationCache routes every mutation error through errorHandler. This pins that
	// wiring so removing it doesn't silently drop all mutation error feedback.
	it('is invoked for failing mutations via the global MutationCache', async () => {
		const observer = new MutationObserver(queryClient, {
			mutationFn: () => Promise.reject(new Error('Import failed: the CSV was malformed')),
		});
		await expect(observer.mutate()).rejects.toThrow('the CSV was malformed');
		expect(toast.error).toHaveBeenCalledWith(
			'Import failed',
			expect.objectContaining({ description: expect.stringContaining('the CSV was malformed') }),
		);
	});

	// A mutation can opt out of the global toast to render its own error UX (e.g. the cloud login
	// flow redirects an unverified user instead of dead-ending on a red toast).
	it('skips the global toast when the mutation sets meta.skipGlobalErrorToast', async () => {
		const observer = new MutationObserver(queryClient, {
			mutationFn: () => Promise.reject(new Error('handled elsewhere')),
			meta: { skipGlobalErrorToast: true },
		});
		await expect(observer.mutate()).rejects.toThrow('handled elsewhere');
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('should display error message from generic error.message', () => {
		// Create a generic error with message property
		const genericError = {
			message: 'Generic error message',
		};

		// Call errorHandler with the generic error
		errorHandler(genericError);

		// Verify toast.error was called with the specific error message
		expect(toast.error).toHaveBeenCalledWith('Error', {
			description: 'Generic error message',
			action: {
				label: 'Dismiss',
				onClick: expect.any(Function),
			},
		});
	});

	it('extracts the nested message when response.data.error is a structured object (#1426)', () => {
		const axiosError = {
			response: {
				data: {
					error: { message: 'npm install exited with code 1', code: 'ERR_INSTALL' },
				},
			},
		} as AxiosError<{ error?: unknown; message?: unknown }>;

		errorHandler(axiosError);

		expect(toast.error).toHaveBeenCalledWith(
			'Error',
			expect.objectContaining({ description: 'npm install exited with code 1' }),
		);
	});

	it('never shows "[object Object]" for a structured error without a nested message', () => {
		const axiosError = {
			response: {
				data: {
					error: { code: 500 },
				},
			},
		} as AxiosError<{ error?: unknown; message?: unknown }>;

		errorHandler(axiosError);

		expect(toast.error).toHaveBeenCalledWith(
			'Error',
			expect.objectContaining({ description: '{"code":500}' }),
		);
	});

	it('collapses repeated 403s onto one toast id (RUM 2026-07-27)', () => {
		const forbidden = {
			response: { status: 403, data: 'Forbidden' },
		} as AxiosError<string>;

		errorHandler(forbidden);
		errorHandler(forbidden);

		// A stable id means sonner replaces the toast instead of stacking — one
		// session produced 525 of these in under an hour before polling was capped.
		expect(toast.error).toHaveBeenCalledTimes(2);
		for (const call of (toast.error as unknown as { mock: { calls: unknown[][] } }).mock.calls) {
			expect(call[1]).toEqual(expect.objectContaining({ id: 'request-forbidden' }));
		}
	});

	it('leaves non-403, non-timeout errors un-collapsed so distinct failures all show', () => {
		errorHandler({ response: { status: 500, data: 'Server Error' } } as AxiosError<string>);

		expect(toast.error).toHaveBeenCalledWith(
			'Error',
			expect.objectContaining({ id: undefined }),
		);
	});

	// Harper 5 REST errors are RFC 9457 Problem Details objects; before these mappings every
	// v5 error toasted the generic "We had some trouble!".
	type ProblemDetails = {
		type?: string;
		code?: unknown;
		title?: string;
		status?: number;
		detail?: string;
		instance?: string;
	};

	it('maps an RFC 9457 body (Harper 5) to code → title, title → description', () => {
		const axiosError = {
			response: {
				data: {
					type: 'error:ClientError',
					code: 'ClientError',
					title: 'Not allowed',
					status: 403,
					instance: '/Cluster/clu-123',
				},
			},
		} as AxiosError<ProblemDetails>;

		errorHandler(axiosError);

		expect(toast.error).toHaveBeenCalledWith(
			'ClientError',
			expect.objectContaining({ description: 'Not allowed' }),
		);
	});

	it('does not colon-split an RFC 9457 title that contains a colon', () => {
		const axiosError = {
			response: {
				data: { code: 'ClientError', title: 'Plan not found: plan-123', status: 400 },
			},
		} as AxiosError<ProblemDetails>;

		errorHandler(axiosError);

		expect(toast.error).toHaveBeenCalledWith(
			'ClientError',
			expect.objectContaining({ description: 'Plan not found: plan-123' }),
		);
	});

	it('appends the RFC 9457 detail to the description when present', () => {
		const axiosError = {
			response: {
				data: { code: 'AccessViolation', title: 'Not authorized', detail: 'Requires the org admin role', status: 403 },
			},
		} as AxiosError<ProblemDetails>;

		errorHandler(axiosError);

		expect(toast.error).toHaveBeenCalledWith(
			'AccessViolation',
			expect.objectContaining({ description: 'Not authorized: Requires the org admin role' }),
		);
	});

	it('falls back to the generic title when an RFC 9457 body has no usable code', () => {
		const axiosError = {
			response: {
				data: { code: 500, title: 'Internal error', status: 500 },
			},
		} as AxiosError<ProblemDetails>;

		errorHandler(axiosError);

		expect(toast.error).toHaveBeenCalledWith(
			'Error',
			expect.objectContaining({ description: 'Internal error' }),
		);
	});
});

describe('queryErrorHandler', () => {
	const networkError = new AxiosError('Network Error', 'ERR_NETWORK');
	const queryFor = (queryKey: unknown[]) => ({ queryKey }) as unknown as Parameters<typeof queryErrorHandler>[1];

	beforeEach(() => {
		vi.clearAllMocks();
		resetRestartTracker();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		vi.spyOn(console, 'debug').mockImplementation(() => undefined);
	});
	afterEach(() => {
		resetRestartTracker();
		vi.restoreAllMocks();
	});

	it('toasts a connectivity failure from an entity that is not restarting', () => {
		queryErrorHandler(networkError, queryFor(['ins-1', 'databases']));
		expect(toast.error).toHaveBeenCalled();
	});

	it('keeps a restarting entity’s connectivity failures out of toasts and out of RUM', () => {
		markRestarting(['ins-1'], { reach: 'down', ttlMs: 60_000 });
		queryErrorHandler(networkError, queryFor(['get_status', 'ins-1']));
		expect(toast.error).not.toHaveBeenCalled();
		// console.error is what the RUM SDK collects; the suppressed failure must not reach it.
		expect(console.error).not.toHaveBeenCalled();
		expect(console.debug).toHaveBeenCalled();
	});

	it('lets a read in flight when a restart settles finish, instead of cancelling and resending it', async () => {
		const release = markRestarting(['ins-9'], { reach: 'down', ttlMs: 60_000 });
		// A poll already holds data, which is when TanStack cancels an in-flight fetch to refetch.
		queryClient.setQueryData(['ins-9', 'status'], 'before');
		let calls = 0;
		let resolveFetch: (value: string) => void = () => {};
		const observer = new QueryObserver(queryClient, {
			queryKey: ['ins-9', 'status'],
			queryFn: () => {
				calls += 1;
				return new Promise<string>((resolve) => {
					resolveFetch = resolve;
				});
			},
		});
		const unsubscribe = observer.subscribe(() => {});

		release();
		// The settle listener's invalidation runs a tick after the release.
		await new Promise((resolve) => setTimeout(resolve, 10));
		resolveFetch('ok');
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(calls).toBe(1);
		unsubscribe();
		queryClient.removeQueries({ queryKey: ['ins-9'] });
	});

	it('leaves a failure a route load is awaiting to the route: no toast, nothing for RUM', () => {
		const query = queryFor(['org-1']);
		const release = claimForRoute(query, new AbortController().signal);

		queryErrorHandler(networkError, query);
		expect(toast.error).not.toHaveBeenCalled();
		expect(console.error).not.toHaveBeenCalled();

		release();
		queryErrorHandler(networkError, query);
		expect(toast.error).toHaveBeenCalledTimes(1);
		expect(console.error).toHaveBeenCalledWith(networkError);
	});

	it('still toasts a real answer from a restarting entity', () => {
		markRestarting(['ins-1'], { reach: 'down', ttlMs: 60_000 });
		queryErrorHandler(
			Object.assign(new AxiosError('Forbidden'), { response: { status: 403, data: 'Forbidden' } }),
			queryFor(['ins-1', 'databases']),
		);
		expect(toast.error).toHaveBeenCalled();
	});
});

describe('a write that got no verdict', () => {
	const sent = (data: unknown, method = 'post') => ({ method, data }) as InternalAxiosRequestConfig;
	const gatewayTimeout = (config: InternalAxiosRequestConfig) =>
		new AxiosError('Request failed with status code 504', AxiosError.ERR_BAD_RESPONSE, config, undefined, {
			status: 504,
			statusText: '',
			data: { type: 'about:blank', code: 'GATEWAY_TIMEOUT', title: 'Proxied operation timed out after 30s' },
			headers: {},
			config,
		});
	const timedOut = (config: InternalAxiosRequestConfig) =>
		new AxiosError('timeout of 60000ms exceeded', AxiosError.ECONNABORTED, config);

	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('is described by its status, not by whatever the gateway sent', () => {
		expect(describeError(gatewayTimeout(sent({ operation: 'insert' })))).toEqual({
			title: OUTCOME_UNKNOWN_TITLE,
			description: UNANSWERED_WRITE_MESSAGE,
			message: UNANSWERED_WRITE_MESSAGE,
		});
	});

	it('leaves a read with the same failure to the usual extraction', () => {
		expect(describeError(gatewayTimeout(sent({ operation: 'get_job' })))).toEqual({
			title: 'GATEWAY_TIMEOUT',
			description: 'Proxied operation timed out after 30s',
			message: 'Proxied operation timed out after 30s',
		});
	});

	it('gets a toast of its own, never collapsed with another write or with read timeouts', () => {
		errorHandler(timedOut(sent({ operation: 'delete', hash_values: [1] })));
		errorHandler(timedOut(sent({ operation: 'insert', records: [{ id: 2 }] })));
		errorHandler(timedOut(sent({ operation: 'describe_all' })));

		const toasts = vi.mocked(toast.error).mock.calls.map(([title, options]) => [title, options?.id]);
		expect(toasts).toEqual([
			[OUTCOME_UNKNOWN_TITLE, undefined],
			[OUTCOME_UNKNOWN_TITLE, undefined],
			['Error', 'request-timeout'],
		]);
	});

	it('tells a mutation’s caller not to add a "failed" toast of its own', () => {
		expect(shouldToastOwnFailure(timedOut(sent({ operation: 'restart' })))).toBe(false);
		expect(shouldToastOwnFailure(timedOut(sent({ operation: 'get_status' })))).toBe(true);
		expect(shouldToastOwnFailure(new Error('Secret "x" not found'))).toBe(true);
	});
});

describe('a restart Harper accepted whose target was never confirmed back', () => {
	const unconfirmed = () =>
		new RestartUnconfirmedError(
			new AxiosError('timeout of 3000ms exceeded', AxiosError.ECONNABORTED, {
				method: 'post',
				data: { operation: 'user_info' },
			} as InternalAxiosRequestConfig),
		);

	it('is described as not back yet, never by the probe’s own failure', () => {
		expect(describeError(unconfirmed())).toEqual({
			title: RESTART_UNCONFIRMED_TITLE,
			description: RESTART_UNCONFIRMED_MESSAGE,
			message: RESTART_UNCONFIRMED_MESSAGE,
		});
	});

	it('tells a mutation’s caller not to add a "failed" toast of its own', () => {
		expect(shouldToastOwnFailure(unconfirmed())).toBe(false);
	});
});

describe('a load job Studio stopped following before it ended', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	const pollFailure = () => {
		const config = { method: 'post', data: JSON.stringify({ operation: 'get_job', id: 'job-7' }) };
		return new AxiosError(
			'Request failed with status code 502',
			AxiosError.ERR_BAD_RESPONSE,
			config as InternalAxiosRequestConfig,
			undefined,
			{
				status: 502,
				statusText: '',
				data: '<html>upstream secret-host-01 is down</html>',
				headers: {},
				config: config as InternalAxiosRequestConfig,
			},
		);
	};

	const anyNode = "If your role can list jobs, also look for job job-7 on the Status page's Jobs tab.";
	it.each(
		[
			['polling-failed', "Studio could no longer read this import's job", anyNode],
			[
				'not-found',
				"Studio couldn't find this import's job on the node it reached",
				"If your role can list jobs, look for job job-7 on the Jobs tab of each instance's Status page: "
				+ 'only the node that ran it lists it.',
			],
			['deadline', 'Studio stopped following this import before it could confirm how it ended', anyNode],
		] as const,
	)('is described as an unknown outcome when %s, naming the job and where to check', (reason, why, where) => {
		const described = describeError(new ImportJobUnconfirmedError('job-7', reason, pollFailure()));

		expect(described.title).toBe(OUTCOME_UNKNOWN_TITLE);
		expect(described.description).toBe(described.message);
		expect(described.message).toContain(why);
		expect(described.message).toContain('It may still be running, or it may have finished.');
		expect(described.message).toContain('Check the table before you import this data again');
		expect(described.message).toContain(where);
		expect(described.message).not.toMatch(/try again|retry|fail/i);
		expect(described.message).not.toContain('secret-host-01');
		expect(described.message).not.toContain('502');
	});

	it('tells a mutation’s caller not to add a "failed" toast of its own', () => {
		expect(shouldToastOwnFailure(new ImportJobUnconfirmedError('job-7', 'deadline'))).toBe(false);
		expect(shouldToastOwnFailure(new ImportJobUnconfirmedError('job-7', 'polling-failed', pollFailure()))).toBe(
			false,
		);
	});

	it('gets a toast of its own, never collapsed with read timeouts, whatever it carries', () => {
		const timeout = new AxiosError('timeout of 60000ms exceeded', AxiosError.ECONNABORTED);
		errorHandler(
			Object.assign(new ImportJobUnconfirmedError('job-7', 'polling-failed', timeout), { code: timeout.code }),
		);
		errorHandler(timeout);

		const toasts = vi.mocked(toast.error).mock.calls.map(([title, options]) => [title, options?.id]);
		expect(toasts).toEqual([[OUTCOME_UNKNOWN_TITLE, undefined], ['Error', 'request-timeout']]);
	});

	it('leaves a job Harper finished with ERROR an ordinary failure', () => {
		const failed = new ImportJobError('Value "x" in property age must be a number');

		expect(describeError(failed).title).not.toBe(OUTCOME_UNKNOWN_TITLE);
		expect(describeError(failed).message).toBe('Value "x" in property age must be a number');
		expect(shouldToastOwnFailure(failed)).toBe(true);
	});

	it('leaves the poll failure itself to the usual extraction, as a read', () => {
		expect(describeError(pollFailure()).title).not.toBe(OUTCOME_UNKNOWN_TITLE);
	});
});
