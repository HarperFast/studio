import { queryErrorHandler } from '@/react-query/queryClient';
import { QueryCache, QueryClient, QueryObserver } from '@tanstack/react-query';
import { toast } from 'sonner';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), dismiss: vi.fn() } }));
afterEach(() => {
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

it('reports observer-free search failures without an extra toast', async () => {
	const report = vi.spyOn(console, 'error').mockImplementation(() => {});
	const client = new QueryClient({ queryCache: new QueryCache({ onError: queryErrorHandler }) });
	const error = new Error('Unavailable');
	await expect(
		client.fetchQuery({
			queryKey: ['search-org'],
			queryFn: () => Promise.reject(error),
			retry: false,
			meta: { inlineSearchError: true },
		}),
	).rejects.toBe(error);
	expect(toast.error).not.toHaveBeenCalled();
	expect(report).toHaveBeenCalledWith(error);
	client.clear();
});

it('preserves normal error presentation for a page observing the same organization', async () => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
	const client = new QueryClient({ queryCache: new QueryCache({ onError: queryErrorHandler }) });
	const observer = new QueryObserver(client, { queryKey: ['org-a'], enabled: false });
	const unsubscribe = observer.subscribe(() => {});
	await expect(
		client.fetchQuery({
			queryKey: ['org-a'],
			queryFn: () => Promise.reject(new Error('Unavailable')),
			retry: false,
			meta: { inlineSearchError: true },
		}),
	).rejects.toThrow();
	expect(toast.error).toHaveBeenCalledOnce();
	unsubscribe();
	client.clear();
});
