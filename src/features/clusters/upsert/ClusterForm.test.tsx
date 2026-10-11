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

import { SchemaPlan } from '@/integrations/api/api.gen';
import { Organization } from '@/integrations/api/api.patch';
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
