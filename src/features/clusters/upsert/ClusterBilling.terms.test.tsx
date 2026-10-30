/**
 * @vitest-environment jsdom
 */
import { ClusterBilling } from '@/features/clusters/upsert/ClusterBilling';
import { SchemaPlan } from '@/integrations/api/api.gen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/organization/queries/getOrganizationQuery', () => ({
	getOrganizationQueryOptions: () => ({
		queryKey: ['org-terms'],
		queryFn: async () => ({
			id: 'org-1',
			type: 'UNRESTRICTED',
			clusters: [{ id: 'clu-contract', commercialSource: null }, { id: 'clu-paid', commercialSource: 'purchased' }],
		}),
	}),
}));
vi.mock('@/features/organization/billing/paymentMethod/PaymentMethodsDisplay', () => ({
	PaymentMethodsDisplay: () => <div>payment method</div>,
}));
vi.mock('@/components/ContactUs', () => ({ ContactUs: () => <span>Contact us</span> }));

afterEach(cleanup);

function renderStep(clusterId?: string, props: Partial<Parameters<typeof ClusterBilling>[0]> = {}) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<ClusterBilling
				clusterId={clusterId}
				isPending={false}
				onGoBackToDetails={() => {}}
				onSaveStateForBillingRedirect={() => {}}
				organizationId="org-1"
				selectedPlan={undefined}
				{...props}
			/>
		</QueryClientProvider>,
	);
}

describe('ClusterBilling in an unrestricted organization', () => {
	it('reminds a contracted cluster of its contract', async () => {
		renderStep('clu-contract');
		expect(await screen.findByText(/billed at your contracted rate/)).toBeTruthy();
	});

	it('does the same for a new cluster', async () => {
		renderStep();
		expect(await screen.findByText(/billed at your contracted rate/)).toBeTruthy();
	});

	it('takes the paid cluster through billing instead', async () => {
		renderStep('clu-paid');
		await screen.findByRole('button', { name: /Edit Cluster/ });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(screen.queryByText(/billed at your contracted rate/)).toBeNull();
	});
});

describe('ClusterBilling while the submit is in flight', () => {
	const dedicated = { deploymentType: 'dedicated' } as SchemaPlan;
	const submitButton = () => screen.getByRole('button', { name: /Create New Cluster/ });

	it('spins the submit button and says the dedicated hosts are being set up', async () => {
		renderStep(undefined, { isPending: true, selectedPlan: dedicated });
		expect(await screen.findByText(/Setting up dedicated hosts/)).toBeTruthy();
		expect(submitButton().querySelector('.animate-spin')).toBeTruthy();
	});

	it('spins without the hosts note for any other plan', async () => {
		renderStep(undefined, { isPending: true, selectedPlan: { deploymentType: 'colocated' } as SchemaPlan });
		await screen.findByRole('button', { name: /Create New Cluster/ });
		expect(submitButton().querySelector('.animate-spin')).toBeTruthy();
		expect(screen.queryByText(/Setting up dedicated hosts/)).toBeNull();
	});
});
