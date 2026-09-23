/** @vitest-environment jsdom */
import type { Cluster } from '@/integrations/api/api.patch';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClustersList } from './ClustersList';

const state = vi.hoisted(() => ({
	clusters: [] as Cluster[],
	create: false,
	saved: null as unknown,
	regions: [] as { id: string; region: string }[],
}));
vi.mock(
	'@tanstack/react-query',
	() => ({
		useQuery: () => ({ data: state.regions }),
		useSuspenseQuery: () => ({ data: { clusters: state.clusters } }),
		queryOptions: (value: unknown) => value,
	}),
);
vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ organizationId: 'org-a' }),
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => <a href={to} {...props}>{children}</a>,
	Navigate: ({ to }: { to: string }) => <p>Navigate {to}</p>,
}));
vi.mock('@/components/SubNavMenu', () => ({ SubNavMenu: () => null }));
vi.mock(
	'@/features/organization/components/OrgPageLayout',
	() => ({ OrgPageLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }),
);
vi.mock(
	'@/features/clusters/components/ClusterCard',
	() => ({ ClusterCard: ({ item }: { item: { cluster: Cluster } }) => <article>{item.cluster.name}</article> }),
);
vi.mock('@/features/clusters/upsert', () => ({ UpsertCluster: () => <p>Create cluster form</p> }));
vi.mock('@/hooks/usePermissions', () => ({ useOrganizationClusterPermissions: () => ({ create: state.create }) }));
vi.mock('@/hooks/useLocalStorage', () => ({ useLocalStorage: () => [state.saved] }));
vi.mock('@/features/organization/queries/getOrganizationQuery', () => ({ getOrganizationQueryOptions: () => ({}) }));

afterEach(() => {
	cleanup();
	state.create = false;
	state.saved = null;
	state.regions = [];
});
const cluster = (id: string, status: string, region: string): Cluster => ({
	id,
	name: id,
	status,
	organizationId: 'org-a',
	plans: [{ planId: 'shared', region }],
});

describe('ClustersList', () => {
	it('combines search and filters while retaining organization summary totals', () => {
		state.clusters = [cluster('Production', 'RUNNING', 'US East'), cluster('Staging', 'FAILED', 'US West')];
		render(<ClustersList />);
		fireEvent.change(screen.getByLabelText('Search clusters'), { target: { value: 'Stag' } });
		expect(screen.getAllByRole('article').map(node => node.textContent)).toEqual(['Staging']);
		expect(screen.getByRole('button', { name: 'Total clusters 2' })).toBeTruthy();
		fireEvent.change(screen.getByLabelText('Cluster region'), { target: { value: 'US East' } });
		expect(screen.getByText('No matching clusters')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
		expect(screen.getAllByRole('article')).toHaveLength(2);
		fireEvent.click(screen.getByRole('button', { name: 'Failures 1' }));
		expect(screen.getAllByRole('article').map(node => node.textContent)).toEqual(['Staging']);
		expect((screen.getByLabelText('Cluster status') as HTMLSelectElement).value).toBe('failed');
	});

	it('sorts by name and reacts to refreshed query data', () => {
		state.clusters = [cluster('Zeta', 'FAILED', 'US West'), cluster('Alpha', 'RUNNING', 'US East')];
		const view = render(<ClustersList />);
		fireEvent.change(screen.getByLabelText('Sort clusters'), { target: { value: 'name' } });
		expect(screen.getAllByRole('article').map(node => node.textContent)).toEqual(['Alpha', 'Zeta']);
		state.clusters = [cluster('Alpha', 'FAILED', 'US East')];
		view.rerender(<ClustersList />);
		expect(screen.getByRole('button', { name: 'Failures 1' })).toBeTruthy();
		expect(screen.getByRole('status').textContent).toBe('Showing 1 of 1 clusters');
	});

	it('resolves id-only plans from the shared catalog and preserves sorting when clearing filters', () => {
		state.clusters = [{ ...cluster('Production', 'RUNNING', ''), plans: [{ planId: 'shared', regionId: 'reg-east' }] }];
		state.regions = [{ id: 'reg-east', region: 'US East' }];
		render(<ClustersList />);
		expect(screen.getByRole('option', { name: 'US East' })).toBeTruthy();
		fireEvent.change(screen.getByLabelText('Sort clusters'), { target: { value: 'name' } });
		fireEvent.change(screen.getByLabelText('Search clusters'), { target: { value: 'East' } });
		expect(screen.getByRole('article').textContent).toBe('Production');
		fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
		expect((screen.getByLabelText('Sort clusters') as HTMLSelectElement).value).toBe('name');
	});

	it('preserves creation permissions and empty-organization behavior', () => {
		state.clusters = [];
		const view = render(<ClustersList />);
		expect(screen.getByText('No clusters yet')).toBeTruthy();
		expect(screen.queryByRole('link', { name: 'New Cluster' })).toBeNull();
		state.create = true;
		view.rerender(<ClustersList />);
		expect(screen.getByText('Create cluster form')).toBeTruthy();
	});

	it('keeps a terminating cluster visible and provides the creation link when allowed', () => {
		state.clusters = [cluster('Deleting', 'TERMINATING', 'US East')];
		state.create = true;
		render(<ClustersList />);
		expect(screen.getByRole('article').textContent).toBe('Deleting');
		expect(screen.getByRole('link', { name: 'New Cluster' }).getAttribute('href')).toBe('/org-a/new-cluster');
	});

	it('preserves a saved cluster creation redirect', () => {
		state.clusters = [cluster('Production', 'RUNNING', 'US East')];
		state.saved = { name: 'Draft' };
		render(<ClustersList />);
		expect(screen.getByText('Navigate /org-a/new-cluster')).toBeTruthy();
	});
});
