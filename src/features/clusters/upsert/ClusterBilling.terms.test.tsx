/**
 * @vitest-environment jsdom
 */
import { ClusterBilling } from '@/features/clusters/upsert/ClusterBilling';
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

function renderStep(clusterId?: string) {
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
			/>
		</QueryClientProvider>,
	);
}

// In an unrestricted organization only the cluster staff moved onto paid terms goes through the card.
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
