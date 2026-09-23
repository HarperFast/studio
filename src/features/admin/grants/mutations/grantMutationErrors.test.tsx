/**
 * @vitest-environment jsdom
 */
import { mutationErrorHandler } from '@/react-query/queryClient';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
const patch = vi.fn();
vi.mock('@/config/apiClient', () => ({
	apiClient: { post: (...a: unknown[]) => post(...a), patch: (...a: unknown[]) => patch(...a) },
}));
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), dismiss: vi.fn() } }));

const { useCreateGrantMutation, useUpdateGrantMutation } = await import('./useUpdateGrant');

// Routes mutation errors the way the app does, so the opt-out is exercised rather than restated.
function wrapper({ children }: { children: ReactNode }) {
	const client = new QueryClient({ mutationCache: new MutationCache({ onError: mutationErrorHandler }) });
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const refusal = Object.assign(new Error('Request failed with status code 400'), {
	response: { status: 400, data: { title: 'refused' } },
});

describe('grant mutations leave the failure toast to their dialog', () => {
	beforeEach(() => {
		post.mockReset().mockRejectedValue(refusal);
		patch.mockReset().mockRejectedValue(refusal);
		toastError.mockClear();
	});

	it('a failed create raises no global toast', async () => {
		const { result } = renderHook(() => useCreateGrantMutation(), { wrapper });
		result.current.mutate({ organizationId: 'org-1', source: 'comped', reason: 'r' });
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(toastError).not.toHaveBeenCalled();
	});

	it('a failed update raises no global toast', async () => {
		const { result } = renderHook(() => useUpdateGrantMutation(), { wrapper });
		result.current.mutate({ id: 'cgr-1', changes: { reason: 'r' } } as Parameters<typeof result.current.mutate>[0]);
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(toastError).not.toHaveBeenCalled();
	});
});
