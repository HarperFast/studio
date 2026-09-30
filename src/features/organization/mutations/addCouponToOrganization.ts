import { apiClient } from '@/config/apiClient';
import { describeError } from '@/react-query/queryClient';
import { useMutation } from '@tanstack/react-query';

/**
 * Resolves with the reason the central manager refused the coupon, or `undefined` once it is applied.
 * A 400 (Stripe rejected it) or 409 (already applied) is an answer for the form, not a failure, so
 * it resolves rather than reaching the global error toast. The body is not text on every version: a
 * Harper 5 central manager sends an RFC 9457 object, which React cannot render as a toast
 * description and which took the whole app down with it.
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
