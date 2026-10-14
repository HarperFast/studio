/** @vitest-environment jsdom */
import type { Cluster } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getInstanceUserInfo } = vi.hoisted(() => ({ getInstanceUserInfo: vi.fn() }));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({ getInstanceUserInfo }));
vi.mock('@tanstack/react-router', () => ({
	Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
	Navigate: ({ to }: { to: string }) => <div>redirected to {to}</div>,
	useNavigate: () => vi.fn(),
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1' }),
	useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock('@/components/SubNavMenu', () => ({ SubNavMenu: () => null }));
vi.mock('@/features/cluster/components/ClusterPageLayout', () => ({
	ClusterPageLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/features/cluster/components/ClusterUsageCard', () => ({ ClusterUsageCard: () => null }));
vi.mock('@/features/clusters/components/ClusterStateMenu', () => ({ ClusterStateMenu: () => null }));
vi.mock('@/hooks/usePermissions', () => ({
	useOrganizationClusterPermissions: () => ({ view: true, update: true }),
}));

let cluster: Cluster;
vi.mock('@/features/cluster/queries/getClusterInfoQuery', () => ({
	getClusterInfoQueryOptions: (clusterId: string) => ({
		queryKey: [clusterId],
		queryFn: async () => cluster,
		staleTime: Infinity,
	}),
}));

const ENTITIES = ['clu-1', 'ins-1', 'ins-2'];

/** A page load on the overview: the store reads the sign-ins remembered in storage when it is built. */
async function openOverview(state: Partial<Cluster>) {
	cluster = {
		id: 'clu-1',
		name: 'prod-east',
		organizationId: 'org-1',
		fqdn: 'prod-east.example.com',
		instances: [{ id: 'ins-1' }, { id: 'ins-2' }],
		...state,
	} as Cluster;
	vi.resetModules();
	const [{ authStore }, { ClusterHome }] = await Promise.all([
		import('@/features/auth/store/authStore'),
		import('./ClusterHome'),
	]);
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.setQueryData(['clu-1'], cluster);
	return {
		authStore,
		render: async () => {
			render(
				<QueryClientProvider client={client}>
					<ClusterHome />
				</QueryClientProvider>,
			);
			await act(() => null);
		},
	};
}

function rememberedEntities() {
	const markers = JSON.parse(localStorage.getItem('Studio:PotentiallyAuthenticated') || '{}');
	return ENTITIES.filter((id) => markers[id] && localStorage.getItem(`Studio:BasicAuth:${id}`));
}

beforeEach(() => {
	localStorage.clear();
	localStorage.setItem(
		'Studio:PotentiallyAuthenticated',
		JSON.stringify(Object.fromEntries(ENTITIES.map((id) => [id, `https://${id}.example.com:9925/`]))),
	);
	for (const id of ENTITIES) {
		localStorage.setItem(`Studio:BasicAuth:${id}`, btoa(JSON.stringify({ username: 'admin', password: 'hunter2' })));
	}
	getInstanceUserInfo.mockResolvedValue({ username: 'admin' });
});

afterEach(() => {
	cleanup();
	vi.resetAllMocks();
	vi.restoreAllMocks();
});

describe('the overview of a cluster with remembered sign-ins', () => {
	it("never checks a terminated cluster's sign-in", async () => {
		const overview = await openOverview({ status: 'TERMINATED' });
		vi.spyOn(overview.authStore, 'signOutEntitiesLocally').mockImplementation(() => undefined);

		await overview.render();

		expect(screen.getByRole('heading', { name: 'Cluster Terminated' })).toBeTruthy();
		expect(getInstanceUserInfo).not.toHaveBeenCalled();
	});

	it("forgets a terminated cluster's sign-in and every instance's", async () => {
		const overview = await openOverview({ status: 'TERMINATED' });

		await overview.render();

		expect(rememberedEntities()).toEqual([]);
		expect(getInstanceUserInfo).not.toHaveBeenCalled();
	});

	it("keeps a terminating cluster's sign-ins until it is terminated", async () => {
		const overview = await openOverview({ status: 'TERMINATING' });

		await overview.render();

		expect(screen.getByRole('heading', { name: 'Cluster Terminating' })).toBeTruthy();
		expect(rememberedEntities()).toEqual(ENTITIES);
		expect(getInstanceUserInfo).not.toHaveBeenCalled();
	});

	it("checks a running cluster's sign-in once and keeps every sign-in", async () => {
		const overview = await openOverview({ status: 'RUNNING' });

		await overview.render();

		expect(await screen.findByText('Enter cluster')).toBeTruthy();
		expect(getInstanceUserInfo).toHaveBeenCalledTimes(1);
		expect(rememberedEntities()).toEqual(ENTITIES);
	});
});
