/** @vitest-environment jsdom */
import type { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import type { Organization } from '@/integrations/api/api.patch';
import { groupThenKeyBy } from '@/lib/groupThenKeyBy';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ClusterForm } from './ClusterForm';
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

function renderForm(defaultValues: Partial<UpsertClusterSchemaType>) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<ClusterForm
				alreadyUsingFree={false}
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
				organizationRegions={[]}
				canUseCustomRegions={false}
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
