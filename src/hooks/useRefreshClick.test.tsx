/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ loading: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/lib/sleep', () => ({ sleep: () => Promise.resolve() }));

import { useRefreshClick } from './useRefreshClick';

afterEach(() => vi.clearAllMocks());

describe('useRefreshClick', () => {
	it('says it refreshed once the refetch resolves', async () => {
		const { result } = renderHook(() => useRefreshClick(() => Promise.resolve()));
		await act(() => result.current());
		expect(toast.success).toHaveBeenCalledWith('Refreshed!', { id: 'refreshing' });
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('says it could not refresh when the refetch rejects, rather than leave it refreshing', async () => {
		const { result } = renderHook(() => useRefreshClick(() => Promise.reject(new Error('timed out'))));
		await act(() => result.current());
		expect(toast.error).toHaveBeenCalledWith("Couldn't refresh everything", { id: 'refreshing' });
		expect(toast.success).not.toHaveBeenCalled();
	});
});
