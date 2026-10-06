import { apiClient } from '@/config/apiClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCents, redeemPromoCode } from './promoCodeApi';

vi.mock('@/config/apiClient', () => ({ apiClient: { post: vi.fn(), get: vi.fn() } }));

const mockedPost = vi.mocked(apiClient.post);
const params = { organizationId: 'org-1', code: 'WELCOME100' };

beforeEach(() => mockedPost.mockReset());

describe('redeemPromoCode', () => {
	it('reports what the code gave', async () => {
		mockedPost.mockResolvedValue({ status: 200, data: { kind: 'voucher', status: 'APPLIED' } });
		await expect(redeemPromoCode(params)).resolves.toEqual({ ok: true, kind: 'voucher' });
		expect(mockedPost).toHaveBeenCalledWith('/PromoRedemption/', params, expect.anything());
	});

	it.each([
		[410, 'That code has expired'],
		[409, 'Your organization has already redeemed this code'],
		[402, 'Add a payment method before redeeming a credit code'],
		[429, 'Too many attempts to redeem a code. Try again in an hour.'],
	])('resolves a %i refusal with central manager’s reason, for the form to show', async (status, title) => {
		mockedPost.mockResolvedValue({ status, data: { type: 'error:ClientError', title, status } });
		await expect(redeemPromoCode(params)).resolves.toEqual({ ok: false, message: title });
	});
});

describe('formatCents', () => {
	it('shows dollars and cents', () => {
		expect(formatCents(12_345)).toMatch(/123\.45/);
	});
});
