import { BadgeStatusVariantValues } from '@/components/ui/utils/badgeStatus';

export function translateStripeStatusToVariant(status?: string): BadgeStatusVariantValues {
	switch (status) {
		case 'paid':
			return 'success';
		case 'void':
		case 'uncollectible':
			return 'destructive';
		case 'draft':
		case 'open':
		default:
			return 'default';
	}
}
