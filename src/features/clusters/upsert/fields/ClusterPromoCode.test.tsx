/**
 * @vitest-environment jsdom
 */
import { UpsertClusterSchemaType } from '@/features/clusters/upsert/upsertClusterSchema';
import { TestProvider } from '@/lib/test/TestProvider';
import { queryClient } from '@/react-query/queryClient';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { useForm, UseFormReturn } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClusterPromoCode } from './ClusterPromoCode';

const invalidateRoute = vi.fn(async () => {});
vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	useRouter: () => ({ invalidate: invalidateRoute }),
}));

let unboundGrants = [{ id: 'cgr-p1' }];
const fetchOrganization = vi.fn(async () => ({ id: 'org-1', unboundGrants }));
vi.mock('@/features/organization/queries/getOrganizationQuery', () => ({
	getOrganizationQueryOptions: (orgId: string) => ({
		queryKey: [orgId, 'promo-field-test'],
		queryFn: fetchOrganization,
		retry: false,
	}),
}));

let redemptions: { code: string; kind: string; status: string; grantId?: string }[] = [];
const redeem = vi.fn();
// Hold the server's answer until a test releases it, to see what the field does in between.
let gate: Promise<void> | null = null;
vi.mock('@/features/organization/billing/promoCodes/promoCodeApi', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/features/organization/billing/promoCodes/promoCodeApi')>()),
	getPromoRedemptionsQueryOptions: (orgId: string) => ({
		queryKey: [orgId, 'promoRedemptions'],
		queryFn: async () => redemptions,
		retry: false,
	}),
	useRedeemPromoCode: () => ({
		isPending: false,
		mutate: (
			variables: unknown,
			options: { onSuccess: (result: unknown) => Promise<void>; onError: (error: unknown) => void },
		) => {
			let result: unknown;
			try {
				result = redeem(variables);
			} catch (error) {
				options.onError(error);
				return;
			}
			void (gate ?? Promise.resolve()).then(() => options.onSuccess(result));
		},
	}),
}));

afterEach(() => {
	cleanup();
	redeem.mockReset();
	invalidateRoute.mockClear();
	fetchOrganization.mockClear();
	onBusyChange.mockClear();
	unboundGrants = [{ id: 'cgr-p1' }];
	gate = null;
	redemptions = [];
	queryClient.clear();
});

let form: UseFormReturn<UpsertClusterSchemaType>;
const submitCluster = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
const onBusyChange = vi.fn();

function Harness() {
	form = useForm<UpsertClusterSchemaType>({ defaultValues: { grantId: '' } as UpsertClusterSchemaType });
	return (
		<form onSubmit={submitCluster}>
			<ClusterPromoCode className="" form={form as never} organizationId="org-1" onBusyChange={onBusyChange} />
		</form>
	);
}

async function mountOpen() {
	render(
		<TestProvider>
			<Harness />
		</TestProvider>,
	);
	await act(() => null);
	fireEvent.click(await screen.findByRole('button', { name: 'Have a promo code?' }));
	return screen.getByLabelText('Promo code');
}

describe('ClusterPromoCode', () => {
	it('selects a redeemed voucher once the organization holding it is reloaded', async () => {
		redeem.mockReturnValue({ ok: true, kind: 'voucher', grantId: 'cgr-p1' });
		const input = await mountOpen();
		fireEvent.change(input, { target: { value: ' demo-hobbyist-30 ' } });
		fireEvent.keyDown(input, { key: 'Enter' });

		expect(await screen.findByText('Free cluster added and selected under Available grants.')).toBeTruthy();
		expect(redeem).toHaveBeenCalledWith({ organizationId: 'org-1', code: 'DEMO-HOBBYIST-30' });
		expect(fetchOrganization).toHaveBeenCalled();
		expect(invalidateRoute).toHaveBeenCalled();
		expect(form.getValues('grantId')).toBe('cgr-p1');
		expect(submitCluster).not.toHaveBeenCalled();
		expect((input as HTMLInputElement).value).toBe('');
	});

	it('holds the cluster submit and ignores a second Enter until the voucher is selected', async () => {
		let release = () => {};
		gate = new Promise((resolve) => {
			release = resolve;
		});
		redeem.mockReturnValue({ ok: true, kind: 'voucher', grantId: 'cgr-p1' });
		const input = await mountOpen();
		fireEvent.change(input, { target: { value: 'DEMO-HOBBYIST-30' } });
		fireEvent.keyDown(input, { key: 'Enter' });
		fireEvent.keyDown(input, { key: 'Enter' });

		expect(redeem).toHaveBeenCalledTimes(1);
		expect(onBusyChange).toHaveBeenLastCalledWith(true);
		release();
		await screen.findByText('Free cluster added and selected under Available grants.');
		expect(onBusyChange).toHaveBeenLastCalledWith(false);
	});

	it('does not select a grant the reloaded organization does not hold', async () => {
		unboundGrants = [];
		redeem.mockReturnValue({ ok: true, kind: 'voucher', grantId: 'cgr-p1' });
		const input = await mountOpen();
		fireEvent.change(input, { target: { value: 'DEMO-HOBBYIST-30' } });
		fireEvent.keyDown(input, { key: 'Enter' });

		expect((await screen.findByRole('status')).textContent).toMatch(
			/Reload the page if it isn’t under Available grants/,
		);
		expect(form.getValues('grantId')).toBe('');
	});

	it('sends an org with no card to Billing for a credit code, since the payment step comes later', async () => {
		redeem.mockReturnValue({ ok: false, status: 402, message: 'Add a payment method before redeeming a credit code' });
		const input = await mountOpen();
		fireEvent.change(input, { target: { value: 'WELCOME100' } });
		fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toMatch(/Create the cluster first/);
		expect(screen.getByRole('link', { name: 'Promo Codes' }).getAttribute('href')).toMatch(
			/\/org-1\/billing\/promo-codes$/,
		);
		expect(form.getValues('grantId')).toBe('');
	});

	it('shows central manager’s reason for any other refusal', async () => {
		redeem.mockReturnValue({ ok: false, status: 410, message: 'That code has expired' });
		const input = await mountOpen();
		fireEvent.change(input, { target: { value: 'OLD-CODE-1' } });
		fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

		expect((await screen.findByRole('alert')).textContent).toBe('That code has expired');
		expect(invalidateRoute).not.toHaveBeenCalled();
	});

	it('confirms a credit without touching the grant', async () => {
		redeem.mockReturnValue({ ok: true, kind: 'credit' });
		const input = await mountOpen();
		fireEvent.change(input, { target: { value: 'WELCOME100' } });
		fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

		expect((await screen.findByRole('status')).textContent).toMatch(/Credit added/);
		expect(form.getValues('grantId')).toBe('');
	});

	it('asks for a check before a retry when the redemption could not be confirmed', async () => {
		redeem.mockImplementation(() => {
			throw new Error('timeout');
		});
		const input = await mountOpen();
		fireEvent.change(input, { target: { value: 'WELCOME100' } });
		fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

		expect((await screen.findByRole('alert')).textContent).toMatch(/couldn’t confirm the redemption/);
		await waitFor(() => expect(fetchOrganization).toHaveBeenCalled());
	});

	it('keeps submit held after an unconfirmed redemption until the organization has reloaded', async () => {
		let release = () => {};
		fetchOrganization.mockImplementationOnce(() =>
			new Promise((resolve) => {
				release = () => resolve({ id: 'org-1', unboundGrants });
			})
		);
		redeem.mockImplementation(() => {
			throw new Error('timeout');
		});
		const input = await mountOpen();
		fireEvent.change(input, { target: { value: 'WELCOME100' } });
		fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

		await screen.findByRole('alert');
		expect(onBusyChange).toHaveBeenLastCalledWith(true);
		release();
		await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
	});

	it('selects the voucher a lost request did land, found by its redemption of this code', async () => {
		redemptions = [{ code: 'DEMO-HOBBYIST-30', kind: 'voucher', status: 'APPLIED', grantId: 'cgr-p1' }];
		unboundGrants = [{ id: 'cgr-other' }, { id: 'cgr-p1' }];
		redeem.mockImplementation(() => {
			throw new Error('timeout');
		});
		const input = await mountOpen();
		fireEvent.change(input, { target: { value: 'DEMO-HOBBYIST-30' } });
		fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

		expect((await screen.findByRole('status')).textContent).toMatch(/arrived after a delay/);
		expect(form.getValues('grantId')).toBe('cgr-p1');
	});

	it('selects nothing when no redemption of this code names a grant, even if another grant appeared', async () => {
		redemptions = [{ code: 'OTHER-CODE-1', kind: 'voucher', status: 'APPLIED', grantId: 'cgr-p1' }];
		redeem.mockImplementation(() => {
			throw new Error('timeout');
		});
		const input = await mountOpen();
		fireEvent.change(input, { target: { value: 'DEMO-HOBBYIST-30' } });
		fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

		await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
		expect(screen.getByRole('alert').textContent).toMatch(/couldn’t confirm the redemption/);
		expect(form.getValues('grantId')).toBe('');
	});

	it('asks for a code before calling central manager', async () => {
		await mountOpen();
		fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
		expect((await screen.findByRole('alert')).textContent).toBe('Enter a code');
		expect(redeem).not.toHaveBeenCalled();
	});
});
