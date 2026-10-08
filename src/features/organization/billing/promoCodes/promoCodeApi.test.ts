import { apiClient } from '@/config/apiClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCents, getPromoRedemptionsQueryOptions, redeemPromoCode } from './promoCodeApi';

vi.mock('@/config/apiClient', () => ({ apiClient: { post: vi.fn(), get: vi.fn() } }));

const mockedPost = vi.mocked(apiClient.post);
const params = { organizationId: 'org-1', code: 'WELCOME100' };

beforeEach(() => mockedPost.mockReset());

describe('redeemPromoCode', () => {
	it('reports what the code gave', async () => {
		mockedPost.mockResolvedValue({ status: 200, data: { kind: 'voucher', status: 'APPLIED', grantId: 'cgr-p1' } });
		await expect(redeemPromoCode(params)).resolves.toEqual({ ok: true, kind: 'voucher', grantId: 'cgr-p1' });
		expect(mockedPost).toHaveBeenCalledWith('/PromoRedemption/', params, expect.anything());
	});

	it('throws when a success answer is not an applied redemption, so it is not shown as one', async () => {
		mockedPost.mockResolvedValue({ status: 200, data: { kind: 'voucher', status: 'CLAIMED' } });
		await expect(redeemPromoCode(params)).rejects.toThrow(/status CLAIMED/);
	});

	it.each([
		[410, 'That code has expired'],
		[409, 'Your organization has already redeemed this code'],
		[402, 'Add a payment method before redeeming a credit code'],
		[429, 'Too many attempts to redeem a code. Try again in an hour.'],
	])('resolves a %i refusal with central manager’s reason, for the form to show', async (status, title) => {
		mockedPost.mockResolvedValue({ status, data: { type: 'error:ClientError', title, status } });
		await expect(redeemPromoCode(params)).resolves.toEqual({ ok: false, status, message: title });
	});
});

describe('getPromoRedemptionsQueryOptions', () => {
	it('polls only while a redemption is still being added', () => {
		const { refetchInterval } = getPromoRedemptionsQueryOptions('org-1');
		const poll = (status: string) =>
			(refetchInterval as (query: unknown) => number | false)({ state: { data: [{ status: 'APPLIED' }, { status }] } });
		expect(poll('CLAIMED')).toBe(30_000);
		expect(poll('EXPIRED')).toBe(false);
	});
});

describe('formatCents', () => {
	it('shows dollars and cents', () => {
		expect(formatCents(12_345)).toMatch(/123\.45/);
	});
});
