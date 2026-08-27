/**
 * Whether creating or editing with these values has to stop at the billing step first.
 *
 * Read in two places that must agree — ClusterForm decides where submit goes, ClusterDetails labels
 * the button that triggers it — so a customer is never sent to billing by a button that promised to
 * create, or the reverse.
 *
 * A claimed grant is what stands in for the card: the billing step's own submit requires a valid
 * payment method, so it would block a create central-manager would have allowed. Whether the grant
 * really covers the payment is the server's call, and it answers with a message if it does not.
 */
export function needsBillingStep(
	{ mode, totalPrice, grantId }: { mode?: string; totalPrice: number; grantId?: string },
): boolean {
	return mode !== 'version' && totalPrice > 0 && !grantId?.trim();
}
