/** @vitest-environment jsdom */
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	post: vi.fn(),
	newest: { deployments: [{ deployment_id: 'v3', project: 'web', status: 'success' }], total: 3 } as object,
	releases: [] as Array<() => Promise<unknown>>,
	params: {} as { entityId: string; entityType: string; instanceClient: object },
	retried: undefined as Promise<unknown> | undefined,
}));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => state.params }));
const clusterA = { entityId: 'clu-a', entityType: 'cluster', instanceClient: { post: state.post } };
state.params = clusterA;
vi.mock('@/features/instance/applications/hooks/useSupportsDeploymentSSE', () => ({
	useReleaseTrackingAvailable: () => true,
}));

import { useComponentReleases, useReleaseCheck, useRetryReleases } from './useComponentReleases';

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

function Retry({ project }: { project?: string }) {
	const retry = useRetryReleases(project);
	const onClick = () => {
		state.retried = retry();
		state.retried.catch(() => undefined);
	};
	return <button type="button" onClick={onClick}>retry {project}</button>;
}

afterEach(() => {
	cleanup();
	state.post.mockClear();
	state.releases = [];
	state.params = clusterA;
	state.newest = { deployments: [{ deployment_id: 'v3', project: 'web', status: 'success' }], total: 3 };
});

async function renderBoth() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={queryClient}>
			<Panel />
			<Detail />
			<Retry />
			<Retry project="api" />
		</QueryClientProvider>,
	);
	await screen.findByText('live-everywhere');
	return queryClient;
}

async function newestChanges(queryClient: QueryClient, status: string, activated: number | boolean[] = 0) {
	const outcomes = typeof activated === 'number' ? Array.from({ length: activated }, () => true) : activated;
	const peer_results = outcomes.map((taken, i) => ({ node: `n${i}`, activation: { activated: taken } }));
	state.newest = { deployments: [{ deployment_id: 'v4', project: 'web', status, peer_results }], total: 4 };
	await act(() => queryClient.refetchQueries({ queryKey: ['clu-a', 'list_deployments'] }));
}

describe('useComponentReleases', () => {
	it('asks the nodes once when it mounts, however many views read it and however the list loads', async () => {
		await renderBoth();
		expect(releaseCalls()).toBe(1);
	});

	it('asks once for a build, not again at each step it takes before going live', async () => {
		const queryClient = await renderBoth();
		for (const status of ['pending', 'extracting', 'installing', 'loading', 'replicating', 'restarting']) {
			await newestChanges(queryClient, status);
			await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
		}
		expect(releaseCalls()).toBe(2);
	});

	it('reads the records again on a retry, then asks the nodes once when they held', async () => {
		await renderBoth();
		const recordReads = () => state.post.mock.calls.filter(([, body]) => body.operation === 'list_deployments').length;
		const readsBefore = recordReads();
		await act(async () => fireEvent.click(screen.getByRole('button', { name: 'retry' })));
		await vi.waitFor(() => expect(releaseCalls()).toBe(2));
		expect(recordReads()).toBeGreaterThan(readsBefore);
		await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
		expect(releaseCalls()).toBe(2);
	});

	it('asks only the views of the component a retry names', async () => {
		await renderBoth();
		await act(async () => fireEvent.click(screen.getByRole('button', { name: 'retry api' })));
		await act(() => state.retried);
		expect(releaseCalls()).toBe(1);
	});

	it('asks the nodes once on a retry that finds a new record, under that record only', async () => {
		await renderBoth();
		state.newest = { deployments: [{ deployment_id: 'v4', project: 'web', status: 'success' }], total: 4 };
		await act(async () => fireEvent.click(screen.getByRole('button', { name: 'retry' })));
		await vi.waitFor(() => expect(releaseCalls()).toBe(2));
		await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
		expect(releaseCalls()).toBe(2);
	});

	it('settles a retry that finds a new record only once the nodes answered for it', async () => {
		await renderBoth();
		let answerNow: (value: object) => void = () => {};
		state.releases.push(() => new Promise((resolve) => (answerNow = resolve)));
		state.newest = { deployments: [{ deployment_id: 'v4', project: 'web', status: 'success' }], total: 4 };
		let settled = false;
		await act(async () => fireEvent.click(screen.getByRole('button', { name: 'retry' })));
		void state.retried!.then(() => (settled = true));
		await vi.waitFor(() => expect(releaseCalls()).toBe(2));
		await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
		expect(settled).toBe(false);
		await act(async () => answerNow({ data: answer }));
		await vi.waitFor(() => expect(settled).toBe(true));
		expect(releaseCalls()).toBe(2);
	});

	it('fails a retry that could not read the nodes, once every view has its answer', async () => {
		await renderBoth();
		state.releases.push(() => Promise.reject(new Error('timed out')));
		await act(async () => fireEvent.click(screen.getByRole('button', { name: 'retry' })));
		await expect(state.retried).rejects.toThrow('timed out');
		await vi.waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('unreadable'));
	});

	it('succeeds once the nodes answered every view again', async () => {
		await renderBoth();
		await act(async () => fireEvent.click(screen.getByRole('button', { name: 'retry' })));
		await expect(state.retried).resolves.toBeUndefined();
	});

	it('does not ask the nodes on a retry whose read of the records failed, and fails it', async () => {
		await renderBoth();
		const answer = state.post.getMockImplementation()!;
		state.post.mockImplementation((url: string, body: { operation: string }) =>
			body.operation === 'list_deployments' ? Promise.reject(new Error('bad gateway')) : answer(url, body)
		);
		try {
			await act(async () => fireEvent.click(screen.getByRole('button', { name: 'retry' })));
			await vi.waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('unreadable'));
			await expect(state.retried).rejects.toThrow('bad gateway');
			await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
			expect(releaseCalls()).toBe(1);
		} finally {
			state.post.mockImplementation(answer);
		}
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

	it('asks again for a change made while a walk runs, rather than take the answer of that walk', async () => {
		const queryClient = await renderBoth();
		const pending: Array<(value: object) => void> = [];
		state.releases.push(() => new Promise((resolve) => pending.push(resolve)));
		state.releases.push(() => new Promise((resolve) => pending.push(resolve)));
		await newestChanges(queryClient, 'rolling_out');
		await vi.waitFor(() => expect(releaseCalls()).toBe(2));
		await newestChanges(queryClient, 'rolling_out', 1);
		await vi.waitFor(() => expect(releaseCalls()).toBe(3));
		await act(async () => pending[0]({ data: answer }));
		expect(screen.getByTestId('detail').textContent).toBe('checking');
		await act(async () => pending[1]({ data: answer }));
		await vi.waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('live-everywhere'));
	});

	it('lets a view opened later read the answer already in hand', async () => {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const { rerender } = render(
			<QueryClientProvider client={queryClient}>
				<Panel />
			</QueryClientProvider>,
		);
		await screen.findByText('ready');
		rerender(
			<QueryClientProvider client={queryClient}>
				<Panel />
				<Detail />
			</QueryClientProvider>,
		);
		expect(screen.getByTestId('detail').textContent).toBe('live-everywhere');
		expect(releaseCalls()).toBe(1);
	});

	it('is not current for a change it cannot ask about yet, such as while offline', async () => {
		const queryClient = await renderBoth();
		await newestChanges(queryClient, 'rolling_out');
		onlineManager.setOnline(false);
		try {
			await newestChanges(queryClient, 'rolling_out', 1);
			await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
			expect(screen.getByTestId('detail').textContent).toBe('checking');
		} finally {
			onlineManager.setOnline(true);
		}
	});

	it('asks again when a node that had not taken a rolling deploy takes it', async () => {
		const queryClient = await renderBoth();
		await newestChanges(queryClient, 'rolling_out', [false]);
		await vi.waitFor(() => expect(releaseCalls()).toBe(2));
		await newestChanges(queryClient, 'rolling_out', [true]);
		await vi.waitFor(() => expect(releaseCalls()).toBe(3));
	});

	it('shows nothing of one cluster as current for another', async () => {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const view = () => (
			<QueryClientProvider client={queryClient}>
				<Panel />
				<Detail />
			</QueryClientProvider>
		);
		const { rerender } = render(view());
		await screen.findByText('live-everywhere');
		state.params = { entityId: 'clu-b', entityType: 'cluster', instanceClient: { post: () => new Promise(() => {}) } };
		rerender(view());
		expect(screen.getByTestId('detail').textContent).toBe('checking');
		expect(screen.getByTestId('panel').textContent).toBe('checking');
	});

	it('cannot answer, rather than check forever, when the records of the component cannot be read', async () => {
		state.params = {
			...clusterA,
			instanceClient: { post: () => Promise.reject(Object.assign(new Error('denied'), { response: { status: 403 } })) },
		};
		render(
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<Detail />
			</QueryClientProvider>,
		);
		await vi.waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('unreadable'));
	});

	it('stops being current once a later read of the records fails', async () => {
		const queryClient = await renderBoth();
		const answer = state.post.getMockImplementation()!;
		state.post.mockImplementation((url: string, body: { operation: string }) =>
			body.operation === 'list_deployments' ? Promise.reject(new Error('bad gateway')) : answer(url, body)
		);
		try {
			await act(() => queryClient.refetchQueries({ queryKey: ['clu-a', 'list_deployments'] }));
			await vi.waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('unreadable'));
		} finally {
			state.post.mockImplementation(answer);
		}
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
