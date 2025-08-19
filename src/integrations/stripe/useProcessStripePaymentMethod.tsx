import {
	useAttachPaymentMethodToOrganization
} from '@/features/organization/mutations/payments/attachPaymentMethodToOrganization';
import { PaymentMethod } from '@stripe/stripe-js/dist/api/payment-methods';
import { useCallback } from 'react';
import { toast } from 'sonner';

export function useProcessStripePaymentMethod(organizationId: string) {
	const { mutate: attachPaymentMethodToOrganization } = useAttachPaymentMethodToOrganization();

	return useCallback((paymentMethod: string | PaymentMethod, onFinished: (added: boolean) => void) => {
		attachPaymentMethodToOrganization({
			paymentMethodId: typeof paymentMethod === 'string' ? paymentMethod : paymentMethod.id,
			organizationId,
		}, {
			onSuccess: () => {
				toast.success('Success! Your payment method has been saved.');
				onFinished(true);
			},
			onError: () => {
				toast.error('Failed to process payment method details. Please try another payment method.');
				onFinished(false);
			},
		});
	}, [attachPaymentMethodToOrganization, organizationId]);
}
