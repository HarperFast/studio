/**
 * @vitest-environment jsdom
 */
import { OrgPageLayout } from '@/features/organization/components/OrgPageLayout';
import type { User } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrgBillingIndex } from './index';
import { PaymentMethodsDisplay } from './paymentMethod/PaymentMethodsDisplay';

const state = vi.hoisted(() => ({ user: null as unknown }));

vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ organizationId: 'org-1' }),
	Outlet: () => <div>billing page</div>,
}));
vi.mock('@/hooks/useAuth', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/hooks/useAuth')>()),
	useCloudAuth: () => ({ user: state.user }),
}));
vi.mock('@/components/SubNavMenu', () => ({ SubNavMenu: () => null }));
vi.mock('@/components/SectionRail', () => ({
	SectionRail: ({ items }: { items: { label: string }[] }) => <nav>{items.map((item) => item.label).join(',')}</nav>,
}));
vi.mock('@/features/organization/queries/getOrganizationQuery', () => ({
	getOrganizationQueryOptions: () => ({
		queryKey: ['org-1'],
		queryFn: async () => ({
			id: 'org-1',
			type: 'SELF_SERVICE',
			clusters: [],
			billing: { paymentMethod: { brand: 'visa', last4: '4242' } },
		}),
	}),
}));
vi.mock('@/features/organization/billing/paymentMethod/AddNewPaymentMethod', () => ({
	AddNewPaymentMethod: () => <div>card form</div>,
}));

afterEach(() => cleanup());

const staff = (staffPermissions: string[]) => ({ fabricRole: 'fabric_staff', staffPermissions, roles: {} }) as User;
const fabricStaff = staff(['org:read', 'billing:read', 'billing:write']);
const readOnlyStaff = staff(['org:read', 'billing:read']);
const member = {
	fabricRole: 'least_privileged',
	staffPermissions: [],
	roles: { 'org-1': { permission: null, organization: { update: false, delete: false } } },
} as unknown as User;

function renderAs(user: User, node: ReactNode) {
	state.user = user;
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe('billing access', () => {
	it('lets billing:write staff without org:update in, and change the card', async () => {
		renderAs(fabricStaff, <OrgBillingIndex />);
		expect(screen.getByText('billing page')).toBeTruthy();
		expect(screen.getByRole('navigation').textContent).toContain('Billing');
		expect(screen.getByRole('navigation').textContent).not.toContain('Settings');
		cleanup();

		renderAs(fabricStaff, <PaymentMethodsDisplay />);
		expect(await screen.findByText(/ending in 4242/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Replace Payment Method' })).toBeTruthy();
	});

	it('lets billing:read staff see the card but not change it', async () => {
		renderAs(readOnlyStaff, <OrgBillingIndex />);
		expect(screen.getByText('billing page')).toBeTruthy();
		cleanup();

		renderAs(readOnlyStaff, <PaymentMethodsDisplay />);
		expect(await screen.findByText(/ending in 4242/)).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Replace Payment Method' })).toBeNull();
	});

	it('still refuses a member without organization update', () => {
		renderAs(member, <OrgBillingIndex />);
		expect(screen.queryByText('billing page')).toBeNull();
		expect(screen.getByText(/You don't have access to manage payments/)).toBeTruthy();
		cleanup();

		renderAs(member, <OrgPageLayout>{null}</OrgPageLayout>);
		expect(screen.getByRole('navigation').textContent).not.toContain('Billing');
	});
});
