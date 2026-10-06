import { apiClient } from '@/config/apiClient';
import type { paths } from '@/integrations/api/api.gen';
import { PromoRedemptionView } from '@/integrations/api/api.patch';
import { describeError } from '@/react-query/queryClient';
import { queryOptions, useMutation } from '@tanstack/react-query';

/** Served by central-manager but not yet in the generated spec; shapes declared in api.patch.d.ts. */
const PROMO_REDEMPTION_PATH = '/PromoRedemption/' as unknown as keyof paths;

export const promoRedemptionsQueryKey = (organizationId: string | undefined) => [organizationId, 'promoRedemptions'];

export function getPromoRedemptionsQueryOptions(organizationId: string | undefined) {
	return queryOptions({
		queryKey: promoRedemptionsQueryKey(organizationId),
		queryFn: async () => {
			const { data } = await apiClient.get(PROMO_REDEMPTION_PATH, { params: { organizationId } });
			return data as unknown as PromoRedemptionView[];
		},
		enabled: !!organizationId,
		retry: false,
	});
}

export type RedeemResult =
	| { ok: true; kind: PromoRedemptionView['kind'] }
	| { ok: false; message: string };

/**
 * POST /PromoRedemption/. A refusal (expired, already redeemed, card needed, too many tries) is an
 * answer for the form, so every 4xx resolves with central manager's reason instead of throwing.
 */
export async function redeemPromoCode(
	{ organizationId, code }: { organizationId: string; code: string },
): Promise<RedeemResult> {
	const response = await apiClient.post(
		PROMO_REDEMPTION_PATH,
		{ organizationId, code } as never,
		{ validateStatus: (status) => status >= 200 && status < 500 },
	);
	if (response.status >= 400) {
		return { ok: false, message: describeError({ response }).message };
	}
	return { ok: true, kind: (response.data as unknown as { kind: PromoRedemptionView['kind'] }).kind };
}

export function useRedeemPromoCode() {
	return useMutation({ mutationFn: redeemPromoCode, meta: { skipGlobalErrorToast: true } });
}

const usd = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
export const formatCents = (cents: number) => usd.format(cents / 100);

const day = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
export const formatDay = (iso: string) => day.format(new Date(iso));
