/** @vitest-environment jsdom */
import { authStore } from '@/features/auth/store/authStore';
import type { Cluster } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	Outlet: () => null,
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1' }),
}));

const { ClusterLayout } = await import('./ClusterLayout');

type SetArgs = Parameters<typeof authStore.setUserForIdAndKey>;
const ENTITIES = ['clu-1', 'ins-1', 'ins-2', 'clu-2'];
const TERMINATED_AT = '2026-10-12T00:00:00.000Z';

function remember(id: string) {
	const user = { username: 'admin' } as SetArgs[2];
	authStore.setUserForIdAndKey(id as SetArgs[0], `https://${id}.example.com:9925/` as SetArgs[1], user);
	authStore.flagForBasicAuth(id, { username: 'admin', password: 'hunter2' });
}

function rememberedEntities() {
	return ENTITIES.filter((id) => !!authStore.getOperationsUrl(id) && !!authStore.checkForBasicAuth(id));
}

function clusterRecord(state: Partial<Cluster>) {
	return { id: 'clu-1', organizationId: 'org-1', instances: [{ id: 'ins-1' }, { id: 'ins-2' }], ...state };
}

async function poll(client: QueryClient, state: Partial<Cluster>) {
	await act(async () => {
		client.setQueryData(['clu-1'], clusterRecord(state));
		await new Promise((resolve) => setTimeout(resolve));
	});
}

async function renderLayout(state: Partial<Cluster>) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
	client.setQueryData(['clu-1'], clusterRecord(state));
	render(
		<QueryClientProvider client={client}>
			<ClusterLayout />
		</QueryClientProvider>,
	);
	await act(() => null);
	return client;
}

beforeEach(() => {
	localStorage.clear();
	ENTITIES.forEach(remember);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	ENTITIES.forEach((id) => authStore.signOutLocally(id));
});

describe('a page of a terminated cluster', () => {
	it.each([
		{ status: 'TERMINATED' },
		{ status: 'REMOVED' },
		{ status: 'FAILED', terminatedAt: TERMINATED_AT },
	])('forgets the sign-ins of a $status cluster and every instance (terminatedAt: $terminatedAt)', async (state) => {
		await renderLayout(state);

		expect(rememberedEntities()).toEqual(['clu-2']);
	});

	it('forgets them once, not on every poll', async () => {
		const signOut = vi.spyOn(authStore, 'signOutEntitiesLocally');
		const client = await renderLayout({ status: 'TERMINATED' });

		await poll(client, { status: 'TERMINATED', name: 'prod-east' });

		expect(signOut).toHaveBeenCalledTimes(1);
	});

	it('forgets them once a terminating cluster is terminated', async () => {
		const client = await renderLayout({ status: 'TERMINATING' });
		expect(rememberedEntities()).toEqual(ENTITIES);

		await poll(client, { status: 'TERMINATED' });

		expect(rememberedEntities()).toEqual(['clu-2']);
	});

	it.each([
		{ name: 'a running cluster', state: { status: 'RUNNING' } },
		{ name: 'a FAILED cluster that may still be serving', state: { status: 'FAILED' } },
		{
			name: 'a removed self-hosted cluster, whose servers may still run',
			state: { status: 'TERMINATED', plans: [{ planId: 'self-hosted-free' }] },
		},
	])('keeps the sign-ins of $name', async ({ state }) => {
		await renderLayout(state as Partial<Cluster>);

		expect(rememberedEntities()).toEqual(ENTITIES);
	});
});
