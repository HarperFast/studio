/** @vitest-environment jsdom */
import { useRestartInstanceClick } from '@/hooks/useRestartInstanceClick';
import { waitUntilAnsweringAfterRestart } from '@/integrations/api/instance/status/restartInstance';
import {
	RESTART_UNCONFIRMED_MESSAGE,
	RESTART_UNCONFIRMED_TITLE,
} from '@/integrations/api/instance/status/restartUnconfirmed';
import { OUTCOME_UNKNOWN_TITLE } from '@/integrations/api/unansweredWrite';
import { isRestarting, resetRestartTracker } from '@/lib/restart/restartTracker';
import { mutationErrorHandler } from '@/react-query/queryClient';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { PropsWithChildren } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ clusterId: 'clu-1', instanceId: 'ins-1' }),
}));

vi.mock(import('@/integrations/api/instance/status/restartInstance'), async (importOriginal) => ({
	...await importOriginal(),
	waitUntilAnsweringAfterRestart: vi.fn(),
}));

vi.mock('sonner', () => ({
	toast: { loading: vi.fn(() => 'restart-toast'), error: vi.fn(), success: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('@/lib/sleep', () => ({
	sleep: vi.fn().mockResolvedValue(true),
}));

function restartAnswering(failure: (config: InternalAxiosRequestConfig) => AxiosError) {
	const post = vi.fn((_url: string, data: unknown) => Promise.reject(failure({ method: 'post', data } as never)));
	return { post } as unknown as AxiosInstance;
}

function probeTimeout(config: InternalAxiosRequestConfig) {
	return new AxiosError('timeout of 3000ms exceeded', AxiosError.ECONNABORTED, config);
}

/**
 * Harper accepts the restart (bin/restart.ts answers before it tears down), then each `user_info`
 * probe gets what `userInfo` returns for its 1-based attempt number.
 */
function restartAccepted(userInfo: (attempt: number, config: InternalAxiosRequestConfig) => Promise<unknown>) {
	let attempts = 0;
	const post = vi.fn((_url: string, data: { operation: string }) => {
		if (data.operation === 'restart') {
			return Promise.resolve({ data: { message: 'Restarting Harper. This may take up to 60 seconds.' } });
		}
		attempts += 1;
		return userInfo(attempts, { method: 'post', data } as InternalAxiosRequestConfig).then((answer) => ({
			data: answer,
		}));
	});
	const count = (operation: string) => post.mock.calls.filter(([, data]) => data.operation === operation).length;
	return { post, restarts: () => count('restart'), probes: () => count('user_info') };
}

const neverAnswers = (_attempt: number, config: InternalAxiosRequestConfig) => Promise.reject(probeTimeout(config));

function render(instanceClient: AxiosInstance) {
	const queryClient = new QueryClient({ mutationCache: new MutationCache({ onError: mutationErrorHandler }) });
	const wrapper = ({ children }: PropsWithChildren) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	return renderHook(() => useRestartInstanceClick({ operation: 'restart', instanceClient }), { wrapper }).result;
}

function errorTitles() {
	return vi.mocked(toast.error).mock.calls.map(([title, options]) => [title, options?.description]);
}

describe('useRestartInstanceClick', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetRestartTracker();
		vi.mocked(waitUntilAnsweringAfterRestart).mockResolvedValue(undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('does not call a restart that got no answer a failure', async () => {
		const result = render(
			restartAnswering((config) => new AxiosError('timeout of 60000ms exceeded', AxiosError.ECONNABORTED, config)),
		);

		await act(() => result.current.onRestartClick());

		expect(errorTitles()).toEqual([[OUTCOME_UNKNOWN_TITLE, expect.stringContaining("couldn't confirm whether")]]);
		expect(toast.dismiss).toHaveBeenCalledWith('restart-toast');
	});

	it('keeps a restart that got no answer marked until its target answers again', async () => {
		let answered = () => {};
		vi.mocked(waitUntilAnsweringAfterRestart).mockReturnValueOnce(new Promise<void>((resolve) => (answered = resolve)));
		const result = render(
			restartAnswering((config) =>
				new AxiosError('Request failed with status code 504', AxiosError.ERR_BAD_RESPONSE, config, undefined, {
					status: 504,
					statusText: '',
					data: 'Proxied operation timed out after 30s on instance ins-1',
					headers: {},
					config,
				})
			),
		);

		await act(() => result.current.onRestartClick());

		expect(isRestarting('ins-1')).toBe(true);
		await act(async () => answered());
		expect(isRestarting('ins-1')).toBe(false);
	});

	it('still says a refused restart failed', async () => {
		const result = render(
			restartAnswering((config) =>
				new AxiosError('Request failed with status code 403', AxiosError.ERR_BAD_REQUEST, config, undefined, {
					status: 403,
					statusText: '',
					data: { error: 'This operation is restricted to super users' },
					headers: {},
					config,
				})
			),
		);

		await act(() => result.current.onRestartClick());

		expect(errorTitles()).toContainEqual(['Error', 'Failed to restart instance.']);
		expect(errorTitles().map(([title]) => title)).not.toContain(OUTCOME_UNKNOWN_TITLE);
		expect(isRestarting('ins-1')).toBe(false);
		expect(waitUntilAnsweringAfterRestart).not.toHaveBeenCalled();
	});

	describe('a restart Harper accepted', () => {
		it('says it is not back yet, never that it failed, when the target does not answer again', async () => {
			const client = restartAccepted(neverAnswers);
			const result = render(client as unknown as AxiosInstance);

			await act(() => result.current.onRestartClick());

			expect(errorTitles()).toEqual([[RESTART_UNCONFIRMED_TITLE, RESTART_UNCONFIRMED_MESSAGE]]);
			expect(toast.dismiss).toHaveBeenCalledWith('restart-toast');
			expect(toast.success).not.toHaveBeenCalled();
			expect(client.restarts()).toBe(1);
			expect(client.probes()).toBe(24);
			expect(isRestarting('ins-1')).toBe(false);
		});

		it('keeps the target marked and the button pending while it is slow to come back', async () => {
			let answer: (() => void) | undefined;
			const client = restartAccepted((attempt, config) =>
				attempt <= 12
					? neverAnswers(attempt, config)
					: new Promise((resolve) => {
						answer = () => resolve({ username: 'admin' });
					})
			);
			const result = render(client as unknown as AxiosInstance);

			let click: Promise<void> | undefined;
			act(() => {
				click = result.current.onRestartClick() as unknown as Promise<void>;
			});
			await vi.waitFor(() => expect(answer).toBeDefined());

			expect(isRestarting('ins-1')).toBe(true);
			const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60_000);
			expect(isRestarting('ins-1')).toBe(true);
			clock.mockRestore();
			expect(result.current.isRestartPending).toBe(true);
			expect(toast.loading).toHaveBeenLastCalledWith('Still restarting', {
				id: 'restart-toast',
				description: "Harper accepted the restart, but the instance isn't back yet. Still waiting for it.",
			});
			expect(toast.error).not.toHaveBeenCalled();

			await act(async () => {
				answer!();
				await click;
			});

			expect(isRestarting('ins-1')).toBe(false);
			expect(toast.error).not.toHaveBeenCalled();
			expect(toast.success).toHaveBeenCalledWith(
				'Success',
				expect.objectContaining({ description: 'Instance restarted!' }),
			);
			expect(client.restarts()).toBe(1);
		});

		it('says it restarted, with no slow-return notice, when the target answers right away', async () => {
			const client = restartAccepted(() => Promise.resolve({ username: 'admin' }));
			const result = render(client as unknown as AxiosInstance);

			await act(() => result.current.onRestartClick());

			expect(toast.error).not.toHaveBeenCalled();
			expect(toast.loading).not.toHaveBeenCalledWith('Still restarting', expect.anything());
			expect(toast.success).toHaveBeenCalledWith(
				'Success',
				expect.objectContaining({ description: 'Instance restarted!' }),
			);
			expect(isRestarting('ins-1')).toBe(false);
		});
	});
});
