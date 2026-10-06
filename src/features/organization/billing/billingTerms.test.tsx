/**
 * @vitest-environment jsdom
 */
import { Invoices } from '@/features/organization/billing/invoices/Invoices';
import { PaymentMethodsDisplay } from '@/features/organization/billing/paymentMethod/PaymentMethodsDisplay';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	organization: {} as Record<string, unknown>,
	canUpdate: true,
	invoiceFetches: 0,
}));

vi.mock('@tanstack/react-router', () => ({ useParams: () => ({ organizationId: 'org-1' }) }));
vi.mock('@/hooks/usePermissions', () => ({ useOrganizationPermissions: () => ({ update: state.canUpdate }) }));
vi.mock('@/features/organization/queries/getOrganizationQuery', () => ({
	getOrganizationQueryOptions: () => ({
		queryKey: ['org', state.organization],
		queryFn: async () => state.organization,
	}),
}));
vi.mock('@/features/organization/billing/paymentMethod/AddNewPaymentMethod', () => ({
	AddNewPaymentMethod: () => <div>card form</div>,
}));
vi.mock('@/integrations/stripe/useGetStripeInvoices', () => ({
	getStripeInvoicesQueryOptions: (organizationId: string | false) => ({
		queryKey: ['invoices', organizationId],
		queryFn: async () => {
			state.invoiceFetches += 1;
			return [];
		},
		enabled: !!organizationId,
	}),
}));
vi.mock('@/components/ContactUs', () => ({ ContactUs: () => <span>Contact us</span> }));

afterEach(() => {
	cleanup();
	state.canUpdate = true;
	state.invoiceFetches = 0;
});

function renderWith(organization: Record<string, unknown>, node: ReactNode) {
	state.organization = organization;
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const contracted = { id: 'org-1', type: 'UNRESTRICTED', clusters: [{ id: 'clu-a', commercialSource: null }] };
const withPaidCluster = {
	...contracted,
	clusters: [{ id: 'clu-a', commercialSource: null }, { id: 'clu-b', commercialSource: 'purchased' }],
};

describe('card screen', () => {
	it('lets an unrestricted organization put a card on file, saying what it is charged for', async () => {
		renderWith(contracted, <PaymentMethodsDisplay />);
		expect(await screen.findByText(/charged only for a cluster your account team moves onto paid terms/)).toBeTruthy();
		expect(screen.getByText('card form')).toBeTruthy();
	});

	it('keeps the contract message for a member who cannot add a card', async () => {
		state.canUpdate = false;
		renderWith(contracted, <PaymentMethodsDisplay />);
		expect(await screen.findByText(/We don.t currently show your payment methods/)).toBeTruthy();
		expect(screen.queryByText('card form')).toBeNull();
	});

	it('says nothing about a contract to a self-service organization', async () => {
		renderWith({ id: 'org-1', type: 'SELF_SERVICE', clusters: [] }, <PaymentMethodsDisplay />);
		await waitFor(() => expect(screen.getByText('card form')).toBeTruthy());
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(screen.queryByText(/billed by your contract/)).toBeNull();
	});
});

describe('invoice screen', () => {
	it('keeps the contract message, and fetches nothing, while no cluster is on paid terms', async () => {
		renderWith(contracted, <Invoices />);
		expect(await screen.findByText(/We don.t currently show your invoices/)).toBeTruthy();
		expect(state.invoiceFetches).toBe(0);
	});

	it('shows Stripe invoices once a cluster of the organization is on paid terms', async () => {
		renderWith(withPaidCluster, <Invoices />);
		await waitFor(() => expect(state.invoiceFetches).toBe(1));
		expect(await screen.findByText(/Your invoices will be shown here/)).toBeTruthy();
	});
});
