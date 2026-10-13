/**
 * @vitest-environment jsdom
 */
import { AdminPromoRedemption } from '@/integrations/api/api.patch';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromoCodeRedemptions } from './PromoCodeRedemptions';

let redemptionList: AdminPromoRedemption[] = [];
let fails = false;
vi.mock('@/features/admin/promoCodes/promoCodeAdminApi', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/features/admin/promoCodes/promoCodeAdminApi')>()),
	getPromoCodeQueryOptions: (id: string) => ({
		queryKey: ['test-promo-code', id, JSON.stringify(redemptionList), fails],
		queryFn: async () => {
			if (fails) { throw new Error('down'); }
			return { id, redemptionList };
		},
		retry: false,
	}),
}));

afterEach(() => {
	cleanup();
	redemptionList = [];
	fails = false;
});

const redemption = (overrides: Partial<AdminPromoRedemption>): AdminPromoRedemption => ({
	id: 'CODE:org-1',
	organizationId: 'org-1',
	organizationName: 'Acme',
	redeemedByUserId: 'usr-a',
	redeemedByEmail: 'a@acme.test',
	redeemedAt: '2026-10-02T00:00:00.000Z',
	status: 'APPLIED',
	...overrides,
});

const open = (kind: 'credit' | 'voucher') =>
	render(
		<TestProvider>
			<PromoCodeRedemptions code="CODE" kind={kind} />
		</TestProvider>,
	);

const rowFor = async (text: string) => (await screen.findByText(text)).closest('tr') as HTMLElement;

describe('PromoCodeRedemptions', () => {
	it('names each organization and who redeemed, with a credit’s amount and what expired', async () => {
		redemptionList = [
			redemption({ creditCents: 10_000, creditExpiresAt: '2099-12-31T00:00:00.000Z' }),
			redemption({
				id: 'CODE:org-2',
				organizationId: 'org-2',
				organizationName: null,
				redeemedByEmail: null,
				redeemedByUserId: 'usr-gone',
				status: 'EXPIRED',
				creditCents: 10_000,
				expiredCents: 3_500,
			}),
		];
		open('credit');

		const acme = await rowFor('Acme');
		expect(within(acme).getByText('a@acme.test')).toBeTruthy();
		expect(within(acme).getByText('Applied')).toBeTruthy();
		expect(within(acme).getByText(/\$100\.00, use by/)).toBeTruthy();
		expect(within(acme).getByRole('link', { name: 'Acme' }).getAttribute('href')).toMatch(
			/\/org-1\/billing\/promo-codes$/,
		);

		const unnamed = await rowFor('org-2');
		expect(within(unnamed).getByText('usr-gone')).toBeTruthy();
		expect(within(unnamed).getByText('Expired')).toBeTruthy();
		expect(within(unnamed).getByText('$100.00; $35.00 expired unused')).toBeTruthy();
	});

	it('shows a voucher’s claiming cluster, or that it is still unclaimed, and a stuck redemption', async () => {
		redemptionList = [
			redemption({ grantId: 'cgr-1', clusterId: 'clu-9', voucherEndsAt: '2099-11-01T00:00:00.000Z' }),
			redemption({
				id: 'CODE:org-2',
				organizationId: 'org-2',
				organizationName: 'Globex',
				grantId: 'cgr-2',
				clusterId: null,
				voucherEndsAt: '2099-11-01T00:00:00.000Z',
			}),
			redemption({ id: 'CODE:org-3', organizationId: 'org-3', organizationName: 'Initech', status: 'FAILED' }),
		];
		open('voucher');

		const acme = await rowFor('Acme');
		expect(within(acme).getByRole('link', { name: 'clu-9' }).getAttribute('href')).toMatch(/\/org-1\/clu-9$/);
		expect(within(await rowFor('Globex')).getByText(/^Unclaimed, ends /)).toBeTruthy();
		const stuck = await rowFor('Initech');
		expect(within(stuck).getByText('Failed')).toBeTruthy();
		expect(within(stuck).getByText('—')).toBeTruthy();
	});

	it('says when nobody has redeemed the code, and when the list could not load', async () => {
		open('credit');
		expect(await screen.findByText('No organization has redeemed this code yet.')).toBeTruthy();
		cleanup();

		fails = true;
		open('credit');
		expect(await screen.findByText('Could not load the redemptions.')).toBeTruthy();
	});
});
