/** @vitest-environment jsdom */
import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_LOG_FILTERS } from '../logView';
import { useInstanceLogs, UseInstanceLogsParams } from './useInstanceLogs';
vi.mock('./useSupportsLogSSE', () => ({ useSupportsLogSSE: () => false }));
vi.mock('@/integrations/api/instance/status/streamReadLog', () => ({ streamReadLog: vi.fn() }));
afterEach(cleanup);
it('uses the same duplicate identity on initial load and polling without leaking between entities', async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const a: ReadLogItem = {
		level: 'info',
		message: 'same event',
		node: '',
		thread: 'main/0',
		timestamp: '2026-11-19T21:00:00Z',
		tags: [],
	};
	const post = vi.fn().mockResolvedValue({ data: [a, { ...a }] });
	const params = {
		entityId: 'a',
		entityType: 'cluster',
		instanceClient: { post },
	} as unknown as UseInstanceLogsParams['params'];
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	const { result, rerender } = renderHook(
		({ params, live }) => useInstanceLogs({ params, live, replicated: true, logFilters: DEFAULT_LOG_FILTERS }),
		{ wrapper, initialProps: { params, live: false } },
	);
	await waitFor(() => expect(result.current.logs).toHaveLength(1));
	rerender({ params, live: true });
	expect(result.current.logs).toEqual([a]);
	expect(result.current.transport).toBe('polling');
	const other = { ...a, message: 'other entity' };
	post.mockResolvedValue({ data: [other] });
	rerender({ params: { ...params, entityId: 'b' }, live: false });
	await waitFor(() => expect(result.current.logs).toEqual([other]));
	expect(post).toHaveBeenLastCalledWith('/', expect.objectContaining({ operation: 'read_log', replicated: true }));
	client.clear();
});
