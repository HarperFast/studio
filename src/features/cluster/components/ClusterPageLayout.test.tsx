/** @vitest-environment jsdom */
import type { SubNavItem } from '@/components/SubNavRail';
import type { Cluster } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1' }),
}));
vi.mock('@/components/SectionRail', () => ({
	SectionRail: ({ items }: { items: SubNavItem[] }) => (
		<ul aria-label="Cluster sections">
			{items.map((item) => <li key={item.to}>{item.label} {item.to}</li>)}
		</ul>
	),
}));
vi.mock('@/features/restart/RestartingNotice', () => ({ RestartingNotice: () => null }));
let permissions = { view: true, update: true };
vi.mock('@/hooks/usePermissions', () => ({ useOrganizationClusterPermissions: () => permissions }));
vi.mock('@/features/cluster/queries/getClusterInfoQuery', () => ({
	getClusterInfoQueryOptions: (clusterId: string) => ({ queryKey: [clusterId], staleTime: Infinity }),
}));

import { ClusterPageLayout } from './ClusterPageLayout';

afterEach(() => {
	cleanup();
	permissions = { view: true, update: true };
});

async function railFor(state: Partial<Cluster>) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.setQueryData(['clu-1'], { id: 'clu-1', organizationId: 'org-1', instances: [], ...state });
	render(
		<QueryClientProvider client={client}>
			<ClusterPageLayout>page</ClusterPageLayout>
		</QueryClientProvider>,
	);
	await act(() => null);
	return screen.getAllByRole('listitem').map((item) => item.textContent);
}

const TERMINATED_AT = '2026-10-12T00:00:00.000Z';
const selfHostedPlans = [{ planId: 'self-hosted' }] as unknown as Cluster['plans'];

describe(ClusterPageLayout, () => {
	it('offers every section of a running cluster', async () => {
		expect(await railFor({ status: 'RUNNING' })).toEqual([
			'Overview /org-1/clu-1',
			'Usage /org-1/clu-1/usage',
			'Scaling /org-1/clu-1/edit',
			'Version /org-1/clu-1/edit/version',
			'Domains /org-1/clu-1/domains',
			'Instances /org-1/clu-1/instances',
		]);
	});

	it.each(['TERMINATED', 'TERMINATING'])('keeps only Overview and Usage for a %s cluster', async (status) => {
		expect(await railFor({ status })).toEqual(['Overview /org-1/clu-1', 'Usage /org-1/clu-1/usage']);
	});

	it('keeps only Overview and Usage for a failed build central manager rolled back', async () => {
		expect(await railFor({ status: 'FAILED', terminatedAt: TERMINATED_AT })).toEqual([
			'Overview /org-1/clu-1',
			'Usage /org-1/clu-1/usage',
		]);
	});

	it('keeps every section of a FAILED cluster without terminatedAt, which may still be serving', async () => {
		expect(await railFor({ status: 'FAILED' })).toHaveLength(6);
	});

	it('keeps only Overview for a removed self-hosted cluster', async () => {
		expect(await railFor({ status: 'REMOVED', plans: selfHostedPlans })).toEqual(['Overview /org-1/clu-1']);
	});

	it('offers a running self-hosted cluster its Configuration and Instances', async () => {
		expect(await railFor({ status: 'RUNNING', plans: selfHostedPlans })).toEqual([
			'Overview /org-1/clu-1',
			'Configuration /org-1/clu-1/edit',
			'Instances /org-1/clu-1/instances',
		]);
	});

	it('still hides the manage sections from a view-only member of a running cluster', async () => {
		permissions = { view: true, update: false };
		expect(await railFor({ status: 'RUNNING' })).toEqual([
			'Overview /org-1/clu-1',
			'Usage /org-1/clu-1/usage',
			'Instances /org-1/clu-1/instances',
		]);
	});
});
