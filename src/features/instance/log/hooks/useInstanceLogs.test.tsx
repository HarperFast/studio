/** @vitest-environment jsdom */
import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_LOG_FILTERS } from '../logView';
import { useInstanceLogs, UseInstanceLogsParams } from './useInstanceLogs';
vi.mock('./useSupportsLogSSE', () => ({ useSupportsLogSSE: () => false }));
vi.mock('@/integrations/api/instance/status/streamReadLog', () => ({ streamReadLog: vi.fn() }));
afterEach(cleanup);
it('preserves repeat occurrences on initial load and polling without leaking between entities', async () => {
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
	await waitFor(() => expect(result.current.logs).toHaveLength(2));
	rerender({ params, live: true });
	expect(result.current.logs).toEqual([a, a]);
	expect(result.current.transport).toBe('polling');
	const other = { ...a, message: 'other entity' };
	post.mockResolvedValue({ data: [other] });
	rerender({ params: { ...params, entityId: 'b' }, live: false });
	await waitFor(() => expect(result.current.logs).toEqual([other]));
	expect(post.mock.lastCall?.[1]).toMatchObject({ operation: 'read_log', replicated: true });
	client.clear();
});

it('retains malformed timestamps on latest and relative views instead of silently discarding diagnostics', async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const base: ReadLogItem = {
		level: 'info',
		message: 'recent',
		node: '',
		thread: 'main/0',
		timestamp: new Date().toISOString(),
		tags: [],
	};
	const invalid = { ...base, message: 'malformed timestamp', timestamp: 'not-a-date' };
	const expired = { ...base, message: 'expired', timestamp: new Date(Date.now() - 3600000).toISOString() };
	const params = {
		entityId: 'timestamps',
		entityType: 'instance',
		instanceClient: { post: vi.fn().mockResolvedValue({ data: [base, invalid, expired] }) },
	} as unknown as UseInstanceLogsParams['params'];
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	const { result, rerender } = renderHook(
		({ filters }) => useInstanceLogs({ params, live: false, replicated: false, logFilters: filters }),
		{ wrapper, initialProps: { filters: DEFAULT_LOG_FILTERS } },
	);
	await waitFor(() => expect(result.current.logs).toContainEqual(invalid));
	expect(result.current.logs).toContainEqual(expired);
	rerender({ filters: { ...DEFAULT_LOG_FILTERS, relative_minutes: '15' } });
	await waitFor(() => expect(result.current.logs).toContainEqual(invalid));
	expect(result.current.logs).toContainEqual(base);
	expect(result.current.logs).not.toContainEqual(expired);
	client.clear();
});

it('reapplies the relative cutoff after a refresh returns an unchanged tail', async () => {
	const start = Date.now();
	const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const entry: ReadLogItem = {
		level: 'info',
		timestamp: new Date(start).toISOString(),
		message: 'ages out',
		node: '',
		thread: 'main/0',
		tags: [],
	};
	const params = {
		entityId: 'cutoff',
		entityType: 'instance',
		instanceClient: { post: vi.fn().mockResolvedValue({ data: [entry] }) },
	} as unknown as UseInstanceLogsParams['params'];
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	try {
		const { result } = renderHook(
			() =>
				useInstanceLogs({
					params,
					live: false,
					replicated: false,
					logFilters: { ...DEFAULT_LOG_FILTERS, relative_minutes: '15' },
				}),
			{ wrapper },
		);
		await waitFor(() => expect(result.current.logs).toHaveLength(1));
		clock.mockReturnValue(start + 16 * 60000);
		await act(async () => {
			await result.current.refetch();
		});
		await waitFor(() => expect(result.current.logs).toHaveLength(0));
	} finally {
		client.clear();
		clock.mockRestore();
	}
});
