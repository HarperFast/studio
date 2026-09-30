import { apiClient } from '@/config/apiClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onAddCouponToOrganizationSubmit } from './addCouponToOrganization';

vi.mock('@/config/apiClient', () => ({
	apiClient: {
		post: vi.fn(),
	},
}));

const mockedPost = vi.mocked(apiClient.post);
const params = { organizationId: 'org-1', couponId: '100OFF' };

beforeEach(() => {
	mockedPost.mockReset();
});

describe('onAddCouponToOrganizationSubmit', () => {
	it('resolves undefined once the coupon is applied', async () => {
		mockedPost.mockResolvedValue({ status: 204, data: '' });
		await expect(onAddCouponToOrganizationSubmit(params)).resolves.toBeUndefined();
		expect(mockedPost).toHaveBeenCalledWith(
			'/Coupon',
			{ organizationId: 'org-1', couponId: '100OFF' },
			expect.anything(),
		);
	});

	it('turns a problem-details refusal into text', async () => {
		mockedPost.mockResolvedValue({
			status: 409,
			data: {
				type: 'error:ClientError',
				code: 'ClientError',
				title: 'Coupon already applied to this organization',
				status: 409,
				instance: '/Coupon',
			},
		});
		await expect(onAddCouponToOrganizationSubmit(params)).resolves.toBe('Coupon already applied to this organization');
	});

	it('passes a plain-text refusal through', async () => {
		mockedPost.mockResolvedValue({ status: 400, data: 'No such coupon: 100OFF' });
		await expect(onAddCouponToOrganizationSubmit(params)).resolves.toBe('No such coupon: 100OFF');
	});
});
