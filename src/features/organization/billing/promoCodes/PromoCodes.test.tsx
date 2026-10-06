/**
 * @vitest-environment jsdom
 */
import { PromoRedemptionView } from '@/integrations/api/api.patch';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromoCodes } from './PromoCodes';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	useParams: () => ({ organizationId: 'org-1' }),
}));

let orgType = 'SELF_SERVICE';
vi.mock('@/features/organization/queries/getOrganizationQuery', () => ({
	getOrganizationQueryOptions: (orgId: string) => ({
		queryKey: [orgId, 'test-org', orgType],
		queryFn: async () => ({ id: orgId, type: orgType }),
		retry: false,
	}),
}));

let redemptions: PromoRedemptionView[] = [];
const redeem = vi.fn();
let listFails = false;
vi.mock('./promoCodeApi', async (importOriginal) => ({
	...(await importOriginal<typeof import('./promoCodeApi')>()),
	getPromoRedemptionsQueryOptions: (orgId: string) => ({
		queryKey: [orgId, 'promoRedemptions', JSON.stringify(redemptions)],
		queryFn: async () => {
			if (listFails) { throw new Error('down'); }
			return redemptions;
		},
		retry: false,
	}),
	useRedeemPromoCode: () => ({
		isPending: false,
		mutate: (
			variables: unknown,
			options: { onSuccess: (result: unknown) => void; onError: (error: unknown) => void },
		) => {
			try {
				options.onSuccess(redeem(variables));
			} catch (error) {
				options.onError(error);
			}
		},
	}),
}));

afterEach(() => {
	cleanup();
	redemptions = [];
	listFails = false;
	orgType = 'SELF_SERVICE';
	redeem.mockReset();
});

const renderPage = () =>
	render(
		<TestProvider>
			<PromoCodes />
		</TestProvider>,
	);

describe('PromoCodes', () => {
	it('lists credit left, what expired, and a voucher ready to use', async () => {
		redemptions = [
			{
				code: 'WELCOME100',
				kind: 'credit',
				status: 'APPLIED',
				redeemedAt: '2026-10-01T00:00:00Z',
				creditCents: 10_000,
				creditExpiresAt: '2026-12-30T00:00:00Z',
				remainingCents: 7_250,
			},
			{
				code: 'SPRING-50',
				kind: 'credit',
				status: 'EXPIRED',
				redeemedAt: '2026-03-01T00:00:00Z',
				creditCents: 5_000,
				creditExpiresAt: '2026-06-01T00:00:00Z',
				remainingCents: 0,
			},
			{
				code: 'LAUNCH-30DAYS',
				kind: 'voucher',
				status: 'APPLIED',
				redeemedAt: '2026-10-02T00:00:00Z',
				shape: [{ planId: 'hobbyist', regionId: 'us-east' }],
				voucherEndsAt: '2026-11-01T00:00:00Z',
				voucherClaimed: false,
			},
		];
		renderPage();
		expect(await screen.findByText(/72\.50 left/)).toBeTruthy();
		expect(screen.getByText('Expired')).toBeTruthy();
		expect(screen.getByText('Free cluster: hobbyist in us-east')).toBeTruthy();
		expect(screen.getByText('Ready to use').closest('a')?.getAttribute('href')).toContain('/org-1/new-cluster');
	});

	it('sends the code upper-cased and shows a refusal under the field', async () => {
		redeem.mockReturnValue({ ok: false, message: 'That code has expired' });
		renderPage();
		fireEvent.change(await screen.findByPlaceholderText('e.g. WELCOME100'), { target: { value: ' welcome100 ' } });
		fireEvent.click(screen.getByRole('button', { name: 'Redeem' }));
		expect(await screen.findByText('That code has expired')).toBeTruthy();
		expect(redeem).toHaveBeenCalledWith({ organizationId: 'org-1', code: 'WELCOME100' });
	});

	it('clears the field once a code is redeemed', async () => {
		redeem.mockReturnValue({ ok: true, kind: 'credit' });
		renderPage();
		const input = await screen.findByPlaceholderText('e.g. WELCOME100');
		fireEvent.change(input, { target: { value: 'WELCOME100' } });
		fireEvent.click(screen.getByRole('button', { name: 'Redeem' }));
		await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
	});

	it('calls an unclaimed voucher past its end expired, not ready', async () => {
		redemptions = [
			{
				code: 'LAUNCH-30DAYS',
				kind: 'voucher',
				status: 'APPLIED',
				redeemedAt: '2026-01-02T00:00:00Z',
				shape: [{ planId: 'hobbyist', regionId: 'us-east' }],
				voucherEndsAt: '2026-02-01T00:00:00Z',
				voucherClaimed: false,
			},
		];
		renderPage();
		expect(await screen.findByText('Expired')).toBeTruthy();
		expect(screen.queryByText('Ready to use')).toBeNull();
	});

	it('says a redemption is still being added, or did not go through, instead of calling it ready', async () => {
		redemptions = [
			{
				code: 'LAUNCH-30DAYS',
				kind: 'voucher',
				status: 'CLAIMED',
				redeemedAt: '2026-10-02T00:00:00Z',
				shape: [{ planId: 'hobbyist', regionId: 'us-east' }],
			},
			{
				code: 'WELCOME100',
				kind: 'credit',
				status: 'FAILED',
				redeemedAt: '2026-10-01T00:00:00Z',
				creditCents: 10_000,
				creditExpiresAt: '2026-12-30T00:00:00Z',
			},
		];
		renderPage();
		expect(await screen.findByText('Being added…')).toBeTruthy();
		expect(screen.getByText(/redeem the code again/)).toBeTruthy();
		expect(screen.queryByText('Ready to use')).toBeNull();
	});

	it('shows a failure the server never answered under the field', async () => {
		redeem.mockImplementation(() => {
			throw new Error('timeout of 60000ms exceeded');
		});
		renderPage();
		fireEvent.change(await screen.findByPlaceholderText('e.g. WELCOME100'), { target: { value: 'WELCOME100' } });
		fireEvent.click(screen.getByRole('button', { name: 'Redeem' }));
		expect(await screen.findByText(/couldn’t confirm the redemption/)).toBeTruthy();
	});

	it('says the list failed rather than that nothing was redeemed', async () => {
		listFails = true;
		renderPage();
		expect(await screen.findByText(/couldn’t be loaded/)).toBeTruthy();
		expect(screen.queryByText(/haven’t redeemed/)).toBeNull();
	});

	it('tells an organization billed by contract that codes do not apply', async () => {
		orgType = 'UNRESTRICTED';
		renderPage();
		expect(await screen.findByText(/billed by contract/)).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Redeem' })).toBeNull();
	});
});
