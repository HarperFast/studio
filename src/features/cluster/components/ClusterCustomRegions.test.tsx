/**
 * @vitest-environment jsdom
 */
import { ClusterCustomRegions } from '@/features/cluster/components/ClusterCustomRegions';
import type { Cluster, Organization, OrganizationRegion } from '@/integrations/api/api.patch';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	regions: undefined as OrganizationRegion[] | null | undefined,
	organization: undefined as Partial<Organization> | undefined,
}));
vi.mock('@tanstack/react-query', () => ({
	useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
		return { data: queryKey[0] === 'organizationRegions' ? state.regions : state.organization };
	},
	queryOptions: (options: unknown) => options,
}));

afterEach(() => {
	cleanup();
	state.regions = undefined;
	state.organization = undefined;
});

const region = (over: Partial<OrganizationRegion> = {}): OrganizationRegion => ({
	id: 'oreg-1',
	organizationId: 'org-1',
	name: 'EU edge',
	placement: { linode: ['fr-par', 'fr-par', 'it-mil'], gcp: ['europe-west1-b'] },
	fallbackGroup: null,
	active: true,
	...over,
});

const cluster = (
	plans: Cluster['plans'],
): Cluster => ({ id: 'clu-1', name: 'c', organizationId: 'org-1', plans } as Cluster);

describe('ClusterCustomRegions', () => {
	it('renders nothing for a catalog-only cluster', () => {
		const { container } = render(
			<ClusterCustomRegions cluster={cluster([{ planId: 'p', regionId: 'us-1', region: 'US' }])} />,
		);
		expect(container.textContent).toBe('');
	});

	it("shows each custom region's units and its shape on the organization's provider", () => {
		state.regions = [region()];
		state.organization = { id: 'org-1', channel: 'Akamai' };
		render(
			<ClusterCustomRegions cluster={cluster([{ planId: 'p', regionId: 'oreg-1', region: 'EU edge', quantity: 2 }])} />,
		);
		expect(screen.getByRole('list', { name: 'Custom regions' }).textContent).toBe(
			'EU edge · 2 units of fr-par ×2 · it-mil',
		);
	});

	it('reads the GCP list for an organization outside the Akamai channel, and one unit by default', () => {
		state.regions = [region()];
		state.organization = { id: 'org-1', channel: undefined };
		render(<ClusterCustomRegions cluster={cluster([{ planId: 'p', regionId: 'oreg-1', region: 'EU edge' }])} />);
		expect(screen.getByRole('listitem').textContent).toBe('EU edge · 1 unit of europe-west1-b');
	});

	it('falls back to the stored plan name when the region list is unavailable', () => {
		state.regions = null;
		render(
			<ClusterCustomRegions cluster={cluster([{ planId: 'p', regionId: 'oreg-1', region: 'EU edge', quantity: 3 }])} />,
		);
		expect(screen.getByRole('listitem').textContent).toBe('EU edge · 3 units');
	});
});
