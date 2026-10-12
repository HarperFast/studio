/** @vitest-environment jsdom */
import { useRestartInstanceClick } from '@/hooks/useRestartInstanceClick';
import { waitUntilAnsweringAfterRestart } from '@/integrations/api/instance/status/restartInstance';
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

function restartAnswering(failure: (config: InternalAxiosRequestConfig) => AxiosError) {
	const post = vi.fn((_url: string, data: unknown) => Promise.reject(failure({ method: 'post', data } as never)));
	return { post } as unknown as AxiosInstance;
}

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
});
