/**
 * @vitest-environment jsdom
 */
import { AdminClusterGrant } from '@/integrations/api/api.patch';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { act, ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GrantFormModal } from './GrantFormModal';

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
	toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}));
vi.mock('@/features/admin/grants/mutations/useUpdateGrant', () => ({
	useUpdateGrantMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const switchToPaid = vi.fn();
// When set, the switch fails with this error instead of succeeding.
let switchFailure: unknown = null;
// When set, the mutation is left in flight: no callback fires until the test releases it.
let holdSwitch = false;
vi.mock('@/features/admin/grants/mutations/useSwitchToPaid', () => ({
	useSwitchToPaidMutation: () => ({
		mutate: (
			input: unknown,
			opts?: { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void; onSettled?: () => void },
		) => {
			switchToPaid(input);
			if (holdSwitch) { return; }
			if (switchFailure) { opts?.onError?.(switchFailure); }
			else { opts?.onSuccess?.({ id: 'cgr-paid' }); }
			opts?.onSettled?.();
		},
		isPending: false,
	}),
}));
vi.mock('@/features/admin/plans/queries/getPlans', () => ({
	getPlansQueryOptions: () => ({ queryKey: ['test-plans'], queryFn: async () => [], retry: false }),
}));
vi.mock('@/features/admin/regions/queries/getRegions', () => ({
	getRegionsQueryOptions: () => ({ queryKey: ['test-regions'], queryFn: async () => [], retry: false }),
}));
vi.mock('@/features/admin/grants/queries/getExpiryPolicies', () => ({
	getExpiryPoliciesQueryOptions: () => ({
		queryKey: ['test-policies'],
		queryFn: async () => ({ editableAtRuntime: false, policies: {} }),
		retry: false,
	}),
}));

afterEach(() => {
	cleanup();
	switchToPaid.mockClear();
	toastSuccess.mockClear();
	toastError.mockClear();
	switchFailure = null;
	holdSwitch = false;
});

function grant(overrides: Partial<AdminClusterGrant> = {}): AdminClusterGrant {
	return {
		id: 'cgr-a',
		organizationId: 'org-1',
		clusterId: 'clu-a',
		source: 'contracted',
		status: 'ACTIVE',
		shape: null,
		startsAt: new Date(Date.now() - 86_400_000).toISOString(),
		endsAt: null,
		expiryPolicy: 'none',
		currentStage: null,
		...overrides,
	} as AdminClusterGrant;
}

type Props = Partial<ComponentProps<typeof GrantFormModal>>;
async function mount(g: AdminClusterGrant, props: Props = {}) {
	render(
		<TestProvider>
			<GrantFormModal
				open
				onOpenChange={() => {}}
				grant={g}
				organizationType="SELF_SERVICE"
				canBill
				onReplaceWithComp={() => {}}
				{...props}
			/>
		</TestProvider>,
	);
	await act(() => null);
	await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

const typeReason = async (value: string) => {
	fireEvent.change(screen.getByPlaceholderText(/Why these terms/), { target: { value } });
	await act(() => null);
};
const switchButton = () => screen.queryByRole('button', { name: 'Switch to paid' });
const confirmDialog = () => screen.getByRole('alertdialog');

describe('GrantFormModal — switchover', () => {
	it('offers no switchover on an unbound voucher, whose revoke stops nothing', async () => {
		await mount(grant({ clusterId: null, source: 'comped' }));
		expect(screen.queryByRole('button', { name: 'Replace with comp' })).toBeNull();
		expect(switchButton()).toBeNull();
		expect(screen.getByRole('button', { name: 'Revoke grant' })).toBeTruthy();
	});

	it('says plainly that revoking a bound grant stops its cluster', async () => {
		await mount(grant());
		expect(screen.getByRole('button', { name: 'Revoke and stop cluster' })).toBeTruthy();
		expect(screen.getByText(/stops the cluster at the next expiry pass/)).toBeTruthy();
	});

	it('hands the grant and the reason typed so far to the replace-with-comp dialog', async () => {
		const onReplaceWithComp = vi.fn();
		await mount(grant(), { onReplaceWithComp });
		await typeReason('sales agreed a comp');
		fireEvent.click(screen.getByRole('button', { name: 'Replace with comp' }));
		expect(onReplaceWithComp).toHaveBeenCalledWith(expect.objectContaining({ id: 'cgr-a' }), 'sales agreed a comp');
	});

	it('a replacement waits for a revoke already in flight', async () => {
		const onReplaceWithComp = vi.fn();
		await mount(grant(), { onReplaceWithComp });
		await typeReason('ending it');
		// The update mock never settles, so the revoke stays in flight.
		fireEvent.click(screen.getByRole('button', { name: 'Revoke and stop cluster' }));
		fireEvent.click(screen.getByRole('button', { name: 'Replace with comp' }));
		expect(onReplaceWithComp).not.toHaveBeenCalled();
	});

	it.each([
		['the viewer lacks billing:write', grant(), { canBill: false }],
		['the grant is already paid', grant({ source: 'purchased' }), {}],
		['the organization is unrestricted', grant(), { organizationType: 'UNRESTRICTED' }],
		['the organization is on the legacy enterprise alias', grant(), { organizationType: 'ENTERPRISE' }],
		// It charges a card: an organization whose type has not loaded is not assumed eligible.
		['the organization type is not known', grant(), { organizationType: undefined }],
	])('offers no switch to paid when %s', async (_why, g, props) => {
		await mount(g, props as Props);
		expect(switchButton()).toBeNull();
	});

	it('offers no switchover on a grant that is not the live one (lapsed or not yet started)', async () => {
		await mount(grant({ isActive: false }));
		expect(screen.queryByRole('button', { name: 'Replace with comp' })).toBeNull();
		expect(switchButton()).toBeNull();
	});

	it('refuses an over-long reason before asking to confirm the charge', async () => {
		await mount(grant());
		await typeReason('x'.repeat(513));
		fireEvent.click(switchButton()!);
		await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
		expect(screen.getByText('Keep the reason under 512 characters')).toBeTruthy();
		expect(screen.queryByRole('alertdialog')).toBeNull();
	});

	it('asks for a reason, confirms the charge, then posts the switchover', async () => {
		await mount(grant());
		fireEvent.click(switchButton()!);
		await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
		expect(screen.getByText('A reason is required to switch to paid')).toBeTruthy();
		expect(screen.queryByRole('alertdialog')).toBeNull();

		await typeReason('contract ended; sales confirmed');
		fireEvent.click(switchButton()!);
		await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
		expect(within(confirmDialog()).getByText(/card on file is charged now/)).toBeTruthy();
		expect(switchToPaid).not.toHaveBeenCalled();

		fireEvent.click(within(confirmDialog()).getByRole('button', { name: 'Switch to paid' }));
		await act(() => null);
		expect(switchToPaid).toHaveBeenCalledTimes(1);
		expect(switchToPaid).toHaveBeenCalledWith({
			clusterId: 'clu-a',
			replaceGrantId: 'cgr-a',
			reason: 'contract ended; sales confirmed',
		});
		expect(toastSuccess).toHaveBeenCalledWith('Switched to paid', { description: 'New grant cgr-paid' });
	});

	it('a second confirm while the first is in flight sends nothing', async () => {
		holdSwitch = true;
		await mount(grant());
		await typeReason('contract ended');
		fireEvent.click(switchButton()!);
		await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
		const confirm = within(confirmDialog()).getByRole('button', { name: 'Switch to paid' });
		fireEvent.click(confirm);
		fireEvent.click(confirm);
		await act(() => null);
		expect(switchToPaid).toHaveBeenCalledTimes(1);
	});

	it('the confirmation cannot be dismissed while the charge is in flight', async () => {
		holdSwitch = true;
		await mount(grant());
		await typeReason('contract ended');
		fireEvent.click(switchButton()!);
		await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
		fireEvent.click(within(confirmDialog()).getByRole('button', { name: 'Switch to paid' }));
		fireEvent.keyDown(confirmDialog(), { key: 'Escape' });
		await act(() => null);
		expect(screen.getByRole('alertdialog')).toBeTruthy();
	});

	it('says when the organization has no card to charge', async () => {
		switchFailure = {
			response: {
				status: 402,
				data: { title: 'Error with Organization org-1 payment method: No default payment method found for customer' },
			},
		};
		await mount(grant());
		await typeReason('contract ended');
		fireEvent.click(switchButton()!);
		await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
		fireEvent.click(within(confirmDialog()).getByRole('button', { name: 'Switch to paid' }));
		await act(() => null);
		expect(toastError).toHaveBeenCalledTimes(1);
		const [title, { description }] = toastError.mock.calls[0];
		expect(title).toBe('Could not switch to paid');
		expect(description).toMatch(/^The organization has no valid card on file\. /);
		expect(description).toContain('No default payment method found for customer');
	});
});
