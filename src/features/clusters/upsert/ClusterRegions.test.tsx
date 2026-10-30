/**
 * @vitest-environment jsdom
 */
import { Form } from '@/components/ui/form/Form';
import { OrganizationRegion } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ClusterRegions } from './ClusterRegions';
import { buildRegionLookup } from './lib/regionLookup';
import { UpsertClusterSchemaType } from './upsertClusterSchema';

// The modal's own form and queries are tested with it; here only which region it opens on matters.
vi.mock('@/features/admin/organizationRegions/components/OrganizationRegionFormModal', () => ({
	OrganizationRegionFormModal: ({ open, region }: { open: boolean; region?: OrganizationRegion | null }) =>
		open ? <div role="dialog">{region ? `Editing ${region.name}` : 'Defining a region'}</div> : null,
}));

// Radix's menu relies on DOM APIs jsdom lacks, and opens on pointerdown.
beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	if (typeof window.PointerEvent === 'undefined') {
		window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
	}
});

afterEach(() => cleanup());

const orgRegion: OrganizationRegion = {
	id: 'oreg-1',
	organizationId: 'org-1',
	name: 'EU edge',
	placement: { gcp: ['europe-west1-b', 'europe-west4-a'] },
	fallbackGroup: null,
	active: true,
};

const range = { min: 0, max: 1 };

function Harness({ organizationRegions, canUseCustomRegions, grantRegionIds, canDefineCustomRegions = false }: {
	organizationRegions: OrganizationRegion[];
	canUseCustomRegions: boolean;
	grantRegionIds?: string[];
	canDefineCustomRegions?: boolean;
}) {
	const form = useForm<UpsertClusterSchemaType>({
		defaultValues: {
			clusterName: 'c',
			abbreviatedName: '',
			deploymentDescription: 'Shared',
			performanceDescription: 'Basic',
			regionPlans: [{ regionId: '' }],
			instances: [],
		},
	});
	return (
		<Form {...form}>
			<ClusterRegions
				form={form}
				regionLocations={[]}
				grantRegionIds={grantRegionIds}
				regionLookup={buildRegionLookup([], organizationRegions, undefined)}
				regionNameToLatencyToRegion={{}}
				premiumOnlyRegions={{ regionNames: new Set(), regionIds: new Set() }}
				usageScale={{ readRate: range, totalReads: range, writeRate: range, totalWrites: range }}
				selectedPlan={undefined}
				totalPrice={10}
				isEnterprise={false}
				cloudProvider={undefined}
				organizationId="org-1"
				canUseCustomRegions={canUseCustomRegions}
				canDefineCustomRegions={canDefineCustomRegions}
				lockedOrganizationRegionIds={[]}
			/>
		</Form>
	);
}

function renderRegions(props: Parameters<typeof Harness>[0]) {
	return render(
		<QueryClientProvider client={new QueryClient()}>
			<Harness {...props} />
		</QueryClientProvider>,
	);
}

describe('ClusterRegions with an empty catalog', () => {
	it('keeps the region rows when a custom region can be deployed instead', () => {
		renderRegions({ organizationRegions: [orgRegion], canUseCustomRegions: true });
		expect(screen.queryByText('No Regions Available')).toBeNull();
	});

	it('says no regions are available when no custom region can stand in', () => {
		renderRegions({ organizationRegions: [orgRegion], canUseCustomRegions: false });
		expect(screen.getByText('No Regions Available')).toBeTruthy();
	});

	it("offers no custom region outside a voucher's regions", () => {
		renderRegions({ organizationRegions: [orgRegion], canUseCustomRegions: true, grantRegionIds: ['us-1'] });
		expect(screen.getByText('No Regions Available')).toBeTruthy();
	});

	it('offers a custom region the voucher lists', () => {
		renderRegions({ organizationRegions: [orgRegion], canUseCustomRegions: true, grantRegionIds: ['oreg-1'] });
		expect(screen.queryByText('No Regions Available')).toBeNull();
	});
});

describe('ClusterRegions for staff who define custom regions', () => {
	const inactive: OrganizationRegion = { ...orgRegion, id: 'oreg-2', name: 'Asia pilot', active: false };
	const openEditMenu = () =>
		fireEvent.pointerDown(screen.getByRole('button', { name: /Edit custom region/ }), { button: 0, ctrlKey: false });

	it("opens any of the organization's regions for editing, inactive ones included", async () => {
		renderRegions({
			organizationRegions: [orgRegion, inactive],
			canUseCustomRegions: true,
			canDefineCustomRegions: true,
		});
		openEditMenu();
		const items = await screen.findAllByRole('menuitem');
		expect(items.map((item) => item.textContent)).toEqual(['Asia pilot (inactive)', 'EU edge']);

		fireEvent.click(items[1]);
		expect((await screen.findByRole('dialog')).textContent).toBe('Editing EU edge');
	});

	it('still defines a new region with no region in hand', async () => {
		renderRegions({ organizationRegions: [orgRegion], canUseCustomRegions: true, canDefineCustomRegions: true });
		fireEvent.click(screen.getByRole('button', { name: /Define custom region/ }));
		expect((await screen.findByRole('dialog')).textContent).toBe('Defining a region');
	});

	it('offers no editing to anyone who cannot define regions', () => {
		renderRegions({ organizationRegions: [orgRegion], canUseCustomRegions: true });
		expect(screen.queryByRole('button', { name: /Edit custom region/ })).toBeNull();
	});
});
