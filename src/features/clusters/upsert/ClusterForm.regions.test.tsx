/** @vitest-environment jsdom */
import type { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import type { Organization, OrganizationRegion } from '@/integrations/api/api.patch';
import { groupThenKeyBy } from '@/lib/groupThenKeyBy';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ClusterForm } from './ClusterForm';
import type { RegionCohort } from './lib/describeRegionSwap';
import type { UpsertClusterSchemaType } from './upsertClusterSchema';

vi.mock('@tanstack/react-router', () => {
	const router = { invalidate: vi.fn() };
	const navigate = vi.fn();
	return { useNavigate: () => navigate, useRouter: () => router };
});

const regions: SchemaRegion[] = [
	{ id: 'us-small', region: 'US', latencyDescription: '90ms, small distribution', instanceCount: 2 },
	{ id: 'us-medium', region: 'US', latencyDescription: '70ms, medium distribution', instanceCount: 4 },
	{ id: 'eu-small', region: 'Europe', latencyDescription: '60ms, small distribution', instanceCount: 2 },
	{ id: 'eu-medium', region: 'Europe', latencyDescription: '45ms, medium distribution', instanceCount: 4 },
	{ id: 'ap-small', region: 'Asia', latencyDescription: '170ms, small distribution', instanceCount: 2 },
	{ id: 'ap-medium', region: 'Asia', latencyDescription: '140ms, medium distribution', instanceCount: 4 },
] as SchemaRegion[];

const colocated = { deploymentType: 'colocated', deploymentDescription: 'Colocated' };
const plans = [
	{
		...colocated,
		id: 'free',
		performanceDescription: 'Free tier',
		priceUsd: 0,
		allowedRegionIds: ['us-small', 'eu-small'],
	},
	{ ...colocated, id: 'medium', performanceDescription: 'Medium tier', priceUsd: 250 },
] as SchemaPlan[];

const organization = { id: 'org-a', name: 'Org A', subdomain: 'org-a' } as Organization;

beforeAll(() => {
	Object.assign(Element.prototype, {
		hasPointerCapture: () => false,
		setPointerCapture: () => {},
		releasePointerCapture: () => {},
		scrollIntoView: () => {},
	});
	window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
});
afterEach(cleanup);

function renderForm(
	defaultValues: Partial<UpsertClusterSchemaType>,
	{ clusterId, currentRegions = [], organizationRegions = [], canUseCustomRegions = false }: {
		clusterId?: string;
		currentRegions?: RegionCohort[];
		organizationRegions?: OrganizationRegion[];
		canUseCustomRegions?: boolean;
	} = {},
) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<ClusterForm
				alreadyUsingFree={false}
				clusterId={clusterId}
				currentRegions={currentRegions}
				defaultValues={{
					clusterName: 'Preview',
					abbreviatedName: '',
					version: '5.2.13',
					deploymentDescription: 'Colocated',
					performanceDescription: 'Medium tier',
					fqdn: '',
					instances: [],
					regionPlans: [],
					...defaultValues,
				}}
				deploymentToPerformanceToPlan={groupThenKeyBy(plans, 'deploymentDescription', 'performanceDescription')}
				harperVersions={{ name: 'versions', description: '', value: [{ name: 'stable', version: '5.2.13' }] }}
				mode={undefined}
				organization={organization}
				organizationId="org-a"
				organizationRegions={organizationRegions}
				canUseCustomRegions={canUseCustomRegions}
				canDefineCustomRegions={false}
				lockedOrganizationRegionIds={[]}
				partialUpgrade={null}
				planTypes={plans}
				regionLocationsColocated={[...regions]}
				regionLocationsDedicated={[...regions]}
				setSavedClusterState={vi.fn()}
				startOffOnBilling={false}
			/>
		</QueryClientProvider>,
	);
}

// The form stores a region id, so read each row as it is shown.
function selectedRegionPlans() {
	const comboboxes = screen.getAllByRole('combobox');
	return screen.getAllByText(/^Region( \d+)?$/, { selector: 'label' }).map(label => {
		const region = label.closest('[data-slot="form-item"]')!.querySelector('[role="combobox"]')!;
		const latency = comboboxes[comboboxes.indexOf(region as HTMLElement) + 1];
		return `${region.textContent} / ${latency?.textContent}`;
	});
}

async function removeRegion(index: number) {
	await act(async () => {
		fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[index]);
	});
}

describe('ClusterForm regions', () => {
	it('leaves the first region alone when the second is removed', async () => {
		renderForm({
			regionPlans: [
				{ regionId: 'eu-medium' },
				{ regionId: 'ap-medium' },
			],
		});

		await removeRegion(1);

		expect(selectedRegionPlans()).toEqual(['Europe / 45ms, medium distribution']);
	});

	it('keeps the first region when the second is removed on a tier that limits regions (#1275)', async () => {
		renderForm({
			performanceDescription: 'Free tier',
			regionPlans: [
				{ regionId: 'eu-medium' },
				{ regionId: 'ap-medium' },
			],
		});
		expect(selectedRegionPlans()).toEqual([
			'Europe / 45ms, medium distribution',
			'Asia / 140ms, medium distribution',
		]);

		await removeRegion(1);

		expect(selectedRegionPlans()).toEqual(['Europe / 60ms, small distribution']);
	});

	it('keeps the surviving region when the first is removed on a tier that limits regions', async () => {
		renderForm({
			performanceDescription: 'Free tier',
			regionPlans: [
				{ regionId: 'ap-medium' },
				{ regionId: 'eu-medium' },
			],
		});

		await removeRegion(0);

		expect(selectedRegionPlans()).toEqual(['Europe / 60ms, small distribution']);
	});

	it('leaves an allowed first region untouched on a tier that limits regions', async () => {
		renderForm({
			performanceDescription: 'Free tier',
			regionPlans: [
				{ regionId: 'eu-small' },
				{ regionId: 'ap-medium' },
			],
		});

		await removeRegion(1);

		expect(selectedRegionPlans()).toEqual(['Europe / 60ms, small distribution']);
	});

	it('falls back to the default region only when the tier offers nothing in the chosen one', async () => {
		renderForm({
			performanceDescription: 'Free tier',
			regionPlans: [
				{ regionId: 'ap-medium' },
				{ regionId: 'eu-medium' },
			],
		});

		await removeRegion(1);

		expect(selectedRegionPlans()).toEqual(['US / 90ms, small distribution']);
	});
});

async function pickOption(currentText: string, option: string) {
	const trigger = screen.getAllByRole('combobox').find(combobox => combobox.textContent === currentText);
	if (!trigger) {
		throw new Error(`No select is showing ${currentText}`);
	}
	await act(async () => {
		fireEvent.click(trigger);
	});
	await act(async () => {
		fireEvent.click(screen.getByRole('option', { name: option }));
	});
}

const submitButton = () =>
	screen.getByRole<HTMLButtonElement>('button', { name: /Confirm Payment Details|Edit Cluster/ });
const swapGuidance = () => screen.queryByText(/can't move out of all its current regions/);

describe('ClusterForm editing regions', () => {
	const editing = { clusterId: 'clu-a', currentRegions: [{ key: 'US', name: 'US' }] };
	const runningInUs = { regionPlans: [{ regionId: 'us-small' }] };

	it('explains the two saves a region swap takes instead of letting the update fail (#1311)', async () => {
		renderForm(runningInUs, editing);

		await pickOption('US', 'Europe');

		expect(selectedRegionPlans()).toEqual(['Europe / 60ms, small distribution']);
		expect(swapGuidance()?.textContent).toBe(
			"A cluster can't move out of all its current regions in one update. Keep US, add Europe as an additional region and save, then remove US once that update has finished.",
		);
		expect(submitButton().disabled).toBe(true);
	});

	it('clears the guidance once a current region is kept alongside the new one', async () => {
		renderForm(runningInUs, editing);
		await pickOption('US', 'Europe');
		expect(swapGuidance()).not.toBeNull();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Add Additional Region Usage' }));
		});
		await pickOption('Asia', 'US');

		expect(swapGuidance()).toBeNull();
		expect(submitButton().disabled).toBe(false);
	});

	it('says a single-region tier cannot move in place', async () => {
		renderForm({ ...runningInUs, performanceDescription: 'Free tier' }, editing);

		await pickOption('US', 'Europe');

		expect(swapGuidance()?.textContent).toBe(
			"A cluster can't move out of all its current regions in one update, and this tier allows only one region, so it can't move from US to Europe. Create a new cluster in Europe instead.",
		);
	});

	it('matches a custom region by id, so a region added beside it needs no guidance', async () => {
		renderForm({ regionPlans: [{ regionId: 'oreg-edge', quantity: 1 }] }, {
			clusterId: 'clu-a',
			currentRegions: [{ key: 'oreg-edge', name: 'Edge' }],
			organizationRegions: [
				{ id: 'oreg-edge', organizationId: 'org-a', name: 'Edge', placement: { gcp: ['us-east1', 'us-west1'] } },
			],
			canUseCustomRegions: true,
		});

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Add Additional Region Usage' }));
		});

		expect(swapGuidance()).toBeNull();
		expect(submitButton().disabled).toBe(false);
	});

	it('never applies to a new cluster', async () => {
		renderForm(runningInUs);

		await pickOption('US', 'Europe');

		expect(selectedRegionPlans()).toEqual(['Europe / 60ms, small distribution']);
		expect(swapGuidance()).toBeNull();
	});
});
