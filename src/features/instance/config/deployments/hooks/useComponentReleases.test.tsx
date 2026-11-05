/** @vitest-environment jsdom */
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	post: vi.fn(),
	newest: { deployments: [{ deployment_id: 'v3', project: 'web', status: 'success' }], total: 3 } as object,
	releases: [] as Array<() => Promise<unknown>>,
}));
vi.mock('@/config/useInstanceClient', () => {
	const params = { entityId: 'clu-a', entityType: 'cluster', instanceClient: { post: state.post } };
	return { useInstanceClientIdParams: () => params };
});
vi.mock('@/features/instance/applications/hooks/useSupportsDeploymentSSE', () => ({
	useReleaseTrackingAvailable: () => true,
}));

import { useComponentReleases, useReleaseCheck } from './useComponentReleases';

const answer = { nodes: [{ node: 'a', components: [{ project: 'web', deployment_id: 'v3', releases: [] }] }] };

state.post.mockImplementation((_url: string, body: { operation: string }) => {
	if (body.operation === 'list_releases') {
		const next = state.releases.shift();
		return next ? next() : Promise.resolve({ data: answer });
	}
	return Promise.resolve({ data: state.newest });
});
const releaseCalls = () => state.post.mock.calls.filter(([, body]) => body.operation === 'list_releases').length;

function Panel() {
	const { state: releases } = useComponentReleases('web');
	return <div data-testid="panel">{releases.kind}</div>;
}

function Detail() {
	return <div data-testid="detail">{useReleaseCheck('web', 'v3').kind}</div>;
}

afterEach(() => {
	cleanup();
	state.post.mockClear();
	state.releases = [];
	state.newest = { deployments: [{ deployment_id: 'v3', project: 'web', status: 'success' }], total: 3 };
});

async function renderBoth() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={queryClient}>
			<Panel />
			<Detail />
		</QueryClientProvider>,
	);
	await screen.findByText('live-everywhere');
	return queryClient;
}

/** Makes the component's newest record read differently, as the list poll would see it. */
async function newestChanges(queryClient: QueryClient, status: string) {
	state.newest = { deployments: [{ deployment_id: 'v4', project: 'web', status }], total: 4 };
	await act(() => queryClient.refetchQueries({ queryKey: ['clu-a', 'list_deployments'] }));
}

describe('useComponentReleases', () => {
	it('asks the nodes once when it mounts, however many views read it and however the list loads', async () => {
		await renderBoth();
		expect(releaseCalls()).toBe(1);
	});

	it('asks again once, for every view, when the component gets a new record', async () => {
		const queryClient = await renderBoth();
		await newestChanges(queryClient, 'rolling_out');
		await vi.waitFor(() => expect(releaseCalls()).toBe(2));
		await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
		expect(releaseCalls()).toBe(2);
	});

	it('is not current while it asks again, nor once asking again failed', async () => {
		const queryClient = await renderBoth();
		let fail: (error: Error) => void = () => {};
		state.releases.push(() => new Promise((_resolve, reject) => (fail = reject)));
		await newestChanges(queryClient, 'success');
		await vi.waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('checking'));
		await vi.waitFor(() => expect(releaseCalls()).toBe(2));
		await act(async () => fail(new Error('timed out')));
		await vi.waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('unreadable'));
		expect(screen.getByTestId('panel').textContent).toBe('unreadable');
	});

	it('does not ask again when the window regains focus', async () => {
		await renderBoth();
		await act(async () => {
			focusManager.setFocused(false);
			focusManager.setFocused(true);
		});
		await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
		expect(releaseCalls()).toBe(1);
		focusManager.setFocused(undefined);
	});
});
