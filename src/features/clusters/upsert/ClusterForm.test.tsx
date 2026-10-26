/**
 * @vitest-environment jsdom
 */
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get, put, post: vi.fn() } }));

vi.mock('@tanstack/react-router', () => {
	const router = { invalidate: vi.fn() };
	const navigate = vi.fn();
	return { useNavigate: () => navigate, useRouter: () => router };
});

vi.mock('sonner', () => ({
	toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(() => 'saving'), dismiss: vi.fn() },
}));

import { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { ClusterGrant, Organization } from '@/integrations/api/api.patch';
import { ENTERPRISE } from '@/integrations/api/orgType';
import { mutationErrorHandler } from '@/react-query/queryClient';
import { toast } from 'sonner';
import { ClusterBilling } from './ClusterBilling';
import { ClusterForm } from './ClusterForm';

/** Central manager's `assertClusterMutable` refusal, through Harper's REST problem-details serializer. */
const refusal = 'Cluster has an instance that is not RUNNING (ins-1: FAILED). Resolve the instance before the update.';
function refused(): AxiosError {
	return {
		isAxiosError: true,
		message: 'Request failed with status code 400',
		response: { status: 400, data: { type: 'error:ClientError', code: 'ClientError', title: refusal, status: 400 } },
	} as AxiosError;
}

function newQueryClient() {
	return new QueryClient({
		mutationCache: new MutationCache({ onError: mutationErrorHandler }),
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
}

const plan = {
	id: 'plan-1',
	deploymentDescription: 'Shared',
	performanceDescription: 'Basic',
	priceUsd: 0,
} as SchemaPlan;

function renderVersionForm() {
	return render(
		<QueryClientProvider client={newQueryClient()}>
			<ClusterForm
				alreadyUsingFree={false}
				clusterId="clu-1"
				currentRegions={[]}
				defaultValues={{
					clusterName: 'my-cluster',
					abbreviatedName: '',
					version: '5.0.2',
					deploymentDescription: 'Shared',
					performanceDescription: 'Basic',
					regionPlans: [],
					instances: [],
				}}
				deploymentToPerformanceToPlan={{ Shared: { Basic: plan } }}
				harperVersions={undefined}
				mode="version"
				organization={{ id: 'org-1' } as Organization}
				organizationId="org-1"
				organizationRegions={[]}
				canUseCustomRegions={false}
				canDefineCustomRegions={false}
				lockedOrganizationRegionIds={[]}
				partialUpgrade={{ latest: '5.0.2', behindCount: 1, total: 2, ambiguous: false }}
				planTypes={[plan]}
				regionLocationsColocated={[]}
				regionLocationsDedicated={[]}
				setSavedClusterState={vi.fn()}
				startOffOnBilling={false}
			/>
		</QueryClientProvider>,
	);
}

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	consoleError.mockRestore();
	vi.resetAllMocks();
});

describe('ClusterForm — a refused edit', () => {
	it("keeps central manager's reason beside the submit button, instead of a toast that fades", async () => {
		put.mockRejectedValue(refused());
		const { findByRole, findByText } = renderVersionForm();
		const submit = await findByRole('button', { name: /Edit Cluster/ }) as HTMLButtonElement;
		await waitFor(() => expect(submit.disabled).toBe(false));

		fireEvent.click(submit);

		expect((await findByText(refusal)).getAttribute('role')).toBe('alert');
		expect(put).toHaveBeenCalledWith('/Cluster/clu-1', expect.objectContaining({ version: '5.0.2' }), {
			timeout: 0,
		});
		expect(toast.error).not.toHaveBeenCalled();
		expect(toast.dismiss).toHaveBeenCalledWith('saving');
		expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ response: expect.anything() }));
	});

	it('drops the reason when the edit is submitted again', async () => {
		put.mockRejectedValueOnce(refused()).mockReturnValue(new Promise(() => {}));
		const { findByRole, findByText, queryByText } = renderVersionForm();
		const submit = await findByRole('button', { name: /Edit Cluster/ }) as HTMLButtonElement;
		await waitFor(() => expect(submit.disabled).toBe(false));
		fireEvent.click(submit);
		await findByText(refusal);

		await waitFor(() => expect(submit.disabled).toBe(false));
		fireEvent.click(submit);

		await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
		expect(queryByText(refusal)).toBeNull();
	});
});

describe('ClusterForm — payment review', () => {
	it('sends a draft that is no longer valid back to the details instead of submitting it', async () => {
		const queryClient = newQueryClient();
		queryClient.setQueryData(['org-1'], { id: 'org-1', type: ENTERPRISE } as Organization);
		const { findByRole, findByText, queryByText } = render(
			<QueryClientProvider client={queryClient}>
				<ClusterForm
					alreadyUsingFree={false}
					clusterId="clu-1"
					defaultValues={{
						clusterName: 'my-cluster',
						abbreviatedName: '',
						version: '5.0.2',
						deploymentDescription: 'Shared',
						performanceDescription: 'Basic',
						// The region shrank to one datacenter while the user was on the payment page.
						regionPlans: [{ regionId: 'oreg-1', quantity: 1 }],
						instances: [],
					}}
					deploymentToPerformanceToPlan={{ Shared: { Basic: plan } }}
					harperVersions={undefined}
					mode={undefined}
					organization={{ id: 'org-1', type: ENTERPRISE } as Organization}
					organizationId="org-1"
					organizationRegions={[{
						id: 'oreg-1',
						organizationId: 'org-1',
						name: 'EU edge',
						placement: { gcp: ['europe-west1-b'] },
						fallbackGroup: null,
						active: true,
					}]}
					canUseCustomRegions={true}
					canDefineCustomRegions={false}
					lockedOrganizationRegionIds={['oreg-1']}
					partialUpgrade={null}
					planTypes={[plan]}
					regionLocationsColocated={[]}
					regionLocationsDedicated={[]}
					setSavedClusterState={vi.fn()}
					startOffOnBilling={true}
				/>
			</QueryClientProvider>,
		);
		const submit = await findByRole('button', { name: /Edit Cluster/ }) as HTMLButtonElement;
		await waitFor(() => expect(submit.disabled).toBe(false));

		fireEvent.click(submit);

		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith('Some cluster details are no longer valid. Please review them.')
		);
		expect(put).not.toHaveBeenCalled();
		expect(queryByText('Payment review')).toBeNull();
		expect(await findByText('A cluster needs at least 2 instances in total.')).toBeTruthy();
	});
});

describe('ClusterForm — region rows', () => {
	const PAID = {
		id: 'plan-paid',
		deploymentDescription: 'Shared',
		performanceDescription: 'Basic',
		priceUsd: 85,
		allowedRegionIds: ['us-1', 'eu-1'],
	} as SchemaPlan;
	const CATALOG = [
		{ id: 'us-1', region: 'US', latencyDescription: 'narrow', instanceCount: 2 },
		{ id: 'eu-1', region: 'EU', latencyDescription: 'narrow', instanceCount: 2 },
	] as SchemaRegion[];
	const CUSTOM = {
		id: 'oreg-1',
		organizationId: 'org-1',
		name: 'EU edge',
		placement: { gcp: ['europe-west1-b'] },
		fallbackGroup: null,
		active: true,
	};
	const TRIAL_US = {
		id: 'cgr-trial',
		organizationId: 'org-1',
		source: 'trial',
		status: 'ACTIVE',
		isActive: true,
		allowedRegionIds: ['us-1'],
	} as unknown as ClusterGrant;

	function renderRows(
		regionPlans: { regionId: string; quantity?: number }[],
		{ clusterId, grant, startOffOnBilling = false, performanceDescription = 'Basic', dedicated = [] }: {
			clusterId?: string;
			grant?: ClusterGrant;
			startOffOnBilling?: boolean;
			performanceDescription?: string;
			dedicated?: SchemaRegion[];
		} = {},
	) {
		const organization = {
			id: 'org-1',
			type: ENTERPRISE,
			unboundGrants: grant ? [grant] : [],
		} as unknown as Organization;
		const queryClient = newQueryClient();
		queryClient.setQueryData(['org-1'], organization);
		return render(
			<QueryClientProvider client={queryClient}>
				<ClusterForm
					alreadyUsingFree={false}
					clusterId={clusterId}
					defaultValues={{
						clusterName: 'my-cluster',
						abbreviatedName: '',
						version: '5.0.2',
						deploymentDescription: 'Shared',
						performanceDescription,
						regionPlans,
						instances: [],
						grantId: grant?.id,
					}}
					deploymentToPerformanceToPlan={{ Shared: { Basic: PAID } }}
					harperVersions={undefined}
					mode={undefined}
					organization={organization}
					organizationId="org-1"
					organizationRegions={[CUSTOM]}
					canUseCustomRegions={true}
					canDefineCustomRegions={false}
					lockedOrganizationRegionIds={[]}
					partialUpgrade={null}
					planTypes={[PAID]}
					regionLocationsColocated={CATALOG}
					regionLocationsDedicated={dedicated}
					setSavedClusterState={vi.fn()}
					startOffOnBilling={startOffOnBilling}
				/>
			</QueryClientProvider>,
		);
	}

	it("does not count a custom row against the plan's one catalog region", async () => {
		put.mockReturnValue(new Promise(() => {}));
		const { findByRole } = renderRows([{ regionId: 'oreg-1', quantity: 1 }, { regionId: 'us-1' }], {
			clusterId: 'clu-1',
			startOffOnBilling: true,
		});
		const submit = await findByRole('button', { name: /Edit Cluster/ }) as HTMLButtonElement;
		await waitFor(() => expect(submit.disabled).toBe(false));

		fireEvent.click(submit);

		await waitFor(() => expect(put).toHaveBeenCalled());
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('still allows only one catalog region on that plan', async () => {
		const { findByText } = renderRows([{ regionId: 'oreg-1', quantity: 1 }, { regionId: 'us-1' }, {
			regionId: 'eu-1',
		}], { clusterId: 'clu-1' });

		expect(await findByText('You can only select one region with this performance tier!')).toBeTruthy();
	});

	it("refuses a custom region outside the voucher's regions", async () => {
		const { findByText } = renderRows([{ regionId: 'oreg-1', quantity: 2 }], { grant: TRIAL_US });

		expect(await findByText('This custom region is not covered by the selected voucher.')).toBeTruthy();
	});

	it('keeps a region the catalog no longer lists, and reports it instead of blanking the row', async () => {
		const { findByText } = renderRows([{ regionId: 'gone-1' }, { regionId: 'oreg-1', quantity: 1 }], {
			clusterId: 'clu-1',
		});

		expect(await findByText('This region is not currently available. Contact us to move this cluster.')).toBeTruthy();
	});

	it('never swaps a row for a sibling tier when only the catalog changed, not the deployment', async () => {
		const { findByText } = renderRows([{ regionId: 'us-ded' }, { regionId: 'oreg-1', quantity: 1 }], {
			clusterId: 'clu-1',
			dedicated: [{ id: 'us-ded', region: 'US', latencyDescription: 'narrow', instanceCount: 2 }] as SchemaRegion[],
		});

		expect(await findByText('This region is not currently available. Contact us to move this cluster.')).toBeTruthy();
	});

	it('a withdrawn performance tier sends payment review back instead of throwing with the submit locked', async () => {
		const { findByRole } = renderRows([{ regionId: 'us-1' }, { regionId: 'oreg-1', quantity: 1 }], {
			clusterId: 'clu-1',
			startOffOnBilling: true,
			performanceDescription: 'Retired',
		});
		const submit = await findByRole('button', { name: /Edit Cluster/ }) as HTMLButtonElement;
		await waitFor(() => expect(submit.disabled).toBe(false));

		fireEvent.click(submit);
		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith('Some cluster details are no longer valid. Please review them.')
		);
		expect(put).not.toHaveBeenCalled();
	});

	it('accepts a custom region the voucher lists', async () => {
		const { findByText, queryByText } = renderRows([{ regionId: 'oreg-1', quantity: 1 }], {
			grant: { ...TRIAL_US, allowedRegionIds: ['us-1', 'oreg-1'] } as ClusterGrant,
		});

		// The floor's message shows the rows were validated.
		expect(await findByText('A cluster needs at least 2 instances in total.')).toBeTruthy();
		expect(queryByText('This custom region is not covered by the selected voucher.')).toBeNull();
	});
});

describe('ClusterBilling', () => {
	it('shows a refused edit above its buttons', () => {
		const queryClient = newQueryClient();
		queryClient.setQueryData(['org-1'], { id: 'org-1', type: ENTERPRISE } as Organization);
		get.mockReturnValue(new Promise(() => {}));
		const { getByText } = render(
			<QueryClientProvider client={queryClient}>
				<ClusterBilling
					clusterId="clu-1"
					isPending={false}
					onGoBackToDetails={vi.fn()}
					onSaveStateForBillingRedirect={vi.fn()}
					organizationId="org-1"
					selectedPlan={plan}
					submitError={refusal}
				/>
			</QueryClientProvider>,
		);

		expect(getByText(refusal).getAttribute('role')).toBe('alert');
	});
});
