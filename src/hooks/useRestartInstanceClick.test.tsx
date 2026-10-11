/** @vitest-environment jsdom */
import { useRestartInstanceClick } from '@/hooks/useRestartInstanceClick';
import { OUTCOME_UNKNOWN_TITLE } from '@/integrations/api/unansweredWrite';
import { resetRestartTracker } from '@/lib/restart/restartTracker';
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
	});
});
