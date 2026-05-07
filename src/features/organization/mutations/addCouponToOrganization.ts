import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

export async function onAddCouponToOrganizationSubmit(
	{ organizationId, couponId }: { organizationId: string; couponId: string },
) {
	const { data } = await apiClient.post(
		'/Coupon' as any,
		{
			organizationId,
			couponId,
		},
		{
			validateStatus: (status) => status >= 200 && status < 400 || status === 400 || status === 409,
		},
	);
	return data;
}

export function useAddCouponToOrganization() {
	return useMutation({
		mutationFn: onAddCouponToOrganizationSubmit,
	});
}
