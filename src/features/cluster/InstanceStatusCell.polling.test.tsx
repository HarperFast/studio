/** @vitest-environment jsdom */
import type { Instance } from '@/integrations/api/api.patch';
import { FakeIntersectionObserver } from '@/test/fakeIntersectionObserver';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstanceStatusCell } from './InstanceStatusCell';

/** Real `getStatusQueryOptions` and a real QueryClient: only the transport is faked, so these
 *  count the requests the instances list actually sends. */
const state = vi.hoisted(() => ({ requests: [] as string[] }));
vi.mock('@/hooks/usePermissions', () => ({ useOrganizationClusterInstancePermissions: () => ({ update: true }) }));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: ({ instanceId }: { instanceId: string }) => ({
		entityId: instanceId,
		instanceClient: {
			post: async () => {
				state.requests.push(instanceId);
				return { data: { systemStatus: [{ id: 'availability', status: 'Available' }], componentStatus: [] } };
			},
		},
	}),
}));
vi.mock('@/integrations/api/instance/status/setStatus', () => ({ useSetStatus: () => ({ mutate: vi.fn() }) }));

const ids = ['ins-0', 'ins-1', 'ins-2'];

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
	state.requests = [];
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	FakeIntersectionObserver.reset();
});

function renderList() {
	const queryClient = new QueryClient();
	render(
		<QueryClientProvider client={queryClient}>
			{ids.map((id, index) => (
				<div key={id} data-row={id}>
					<InstanceStatusCell
						instance={{ id, status: 'RUNNING', instanceFqdn: `${id}.example.com`, version: '4.7.3' } as Instance}
						index={index}
					/>
				</div>
			))}
		</QueryClientProvider>,
	);
	return queryClient;
}

function rowIs(id: string) {
	return (target: Element) => target.closest('[data-row]')?.getAttribute('data-row') === id;
}

function requestsFor(id: string) {
	return state.requests.filter(r => r === id).length;
}

describe('instances list get_status polling', () => {
	it('polls only the rows on screen', async () => {
		const queryClient = renderList();
		// Past the per-row stagger; React flushes the `ready` update only when an act() ends.
		await act(() => vi.advanceTimersByTimeAsync(2_000));
		act(() => FakeIntersectionObserver.setIntersecting(true, rowIs('ins-0')));
		await act(() => vi.advanceTimersByTimeAsync(60_000));

		expect(requestsFor('ins-0')).toBe(7);
		expect(requestsFor('ins-1')).toBe(0);
		expect(requestsFor('ins-2')).toBe(0);
		queryClient.clear();
	});

	it('fetches a row as soon as it scrolls into view, then keeps its 10s cadence', async () => {
		const queryClient = renderList();
		await act(() => vi.advanceTimersByTimeAsync(30_000));
		expect(state.requests).toHaveLength(0);

		act(() => FakeIntersectionObserver.setIntersecting(true, rowIs('ins-1')));
		await act(() => vi.advanceTimersByTimeAsync(0));
		expect(requestsFor('ins-1')).toBe(1);

		await act(() => vi.advanceTimersByTimeAsync(30_000));
		expect(requestsFor('ins-1')).toBe(4);
		queryClient.clear();
	});
});
