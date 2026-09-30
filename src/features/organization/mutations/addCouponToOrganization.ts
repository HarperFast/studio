import { apiClient } from '@/config/apiClient';
import { describeError } from '@/react-query/queryClient';
import { useMutation } from '@tanstack/react-query';

/**
 * Resolves with the reason the coupon was refused (400/409), or `undefined` once it is applied. A
 * refusal is an answer for the form, so it resolves as text rather than reaching the global toast.
 */
export async function onAddCouponToOrganizationSubmit(
	{ organizationId, couponId }: { organizationId: string; couponId: string },
): Promise<string | undefined> {
	const response = await apiClient.post(
		'/Coupon' as any,
		{
			organizationId,
			couponId,
		},
		{
			validateStatus: (status) => status >= 200 && status < 400 || status === 400 || status === 409,
		},
	);
	if (response.status === 400 || response.status === 409) {
		return describeError({ response }).message;
	}
	return undefined;
}

export function useAddCouponToOrganization() {
	return useMutation({
		mutationFn: onAddCouponToOrganizationSubmit,
	});
}
