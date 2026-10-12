import { apiClient } from '@/config/apiClient';
import type { paths } from '@/integrations/api/api.gen';
import { AdminPromoCode, AdminPromoCodeDetail, GrantShapeEntry, PromoKind } from '@/integrations/api/api.patch';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

/** Served by central-manager but not yet in the generated spec; shapes declared in api.patch.d.ts. */
const PROMO_CODES_PATH = '/Admin/PromoCode/' as unknown as keyof paths;
const promoCodePath = (id: string) => `/Admin/PromoCode/${encodeURIComponent(id)}` as unknown as keyof paths;

const promoCodesQueryKey = ['fabric-admin', 'promoCodes'];

export function getPromoCodesQueryOptions() {
	return queryOptions({
		queryKey: promoCodesQueryKey,
		queryFn: async () => {
			const { data } = await apiClient.get(PROMO_CODES_PATH);
			return data as unknown as AdminPromoCode[];
		},
		retry: false,
	});
}

export function getPromoCodeQueryOptions(id: string) {
	return queryOptions({
		queryKey: [...promoCodesQueryKey, id],
		queryFn: async () => {
			const { data } = await apiClient.get(promoCodePath(id));
			return data as unknown as AdminPromoCodeDetail;
		},
		retry: false,
	});
}

/** What `POST /Admin/PromoCode` accepts. Omitting `code` has central manager generate one. */
export interface CreatePromoCodeBody {
	code?: string;
	kind: PromoKind;
	redeemBy: string;
	maxRedemptions?: number | null;
	creditCents?: number;
	creditValidDays?: number;
	shape?: GrantShapeEntry[];
	voucherDays?: number;
	campaign?: string;
}

export function useCreatePromoCode() {
	const queryClient = useQueryClient();
	return useMutation<AdminPromoCode, Error, CreatePromoCodeBody>({
		mutationFn: async (body) => {
			const { data } = await apiClient.post(PROMO_CODES_PATH, body as never);
			return data as unknown as AdminPromoCode;
		},
		// The dialog shows the failure itself.
		meta: { skipGlobalErrorToast: true },
		onSuccess: () => queryClient.invalidateQueries({ queryKey: promoCodesQueryKey }),
	});
}

export function useSetPromoCodeDisabled() {
	const queryClient = useQueryClient();
	return useMutation<AdminPromoCode, Error, { id: string; disabled: boolean }>({
		mutationFn: async ({ id, disabled }) => {
			const { data } = await apiClient.patch(promoCodePath(id), { disabled } as never);
			return data as unknown as AdminPromoCode;
		},
		// The page toasts the failure itself.
		meta: { skipGlobalErrorToast: true },
		onSuccess: () => queryClient.invalidateQueries({ queryKey: promoCodesQueryKey }),
	});
}
