import { ProcessSetupIntent } from '@/features/organization/billing/confirm/ProcessSetupIntent';
import { StripeWrapper } from '@/integrations/stripe/StripeContext';

export function ConfirmSetupIntent() {
	return <StripeWrapper><ProcessSetupIntent /></StripeWrapper>;
}
