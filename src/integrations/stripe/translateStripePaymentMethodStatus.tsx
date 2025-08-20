import { BadgeStatusVariantValues } from '@/components/ui/utils/badgeStatus';
import { PaymentMethodStatus } from '@/integrations/stripe/paymentMethodStatus';

export function translateStripePaymentMethodStatusToVariant(paymentMethodStatus: PaymentMethodStatus | string): BadgeStatusVariantValues {
	switch (paymentMethodStatus) {
		case PaymentMethodStatus.PASS:
			return 'success';
		case PaymentMethodStatus.FAIL:
		case PaymentMethodStatus.ERROR:
			return 'destructive';
		case PaymentMethodStatus.PENDING:
		default:
			return 'default';
	}
}

export function translateStripePaymentMethodStatusToText(paymentMethodStatus: PaymentMethodStatus | string): string {
	switch (paymentMethodStatus) {
		case PaymentMethodStatus.PASS:
			return 'READY';
		case PaymentMethodStatus.FAIL:
		case PaymentMethodStatus.ERROR:
		case PaymentMethodStatus.PENDING:
		default:
			return paymentMethodStatus.toUpperCase();
	}
}
