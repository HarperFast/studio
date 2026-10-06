export const UNRESTRICTED = 'UNRESTRICTED';
/**
 * Legacy alias for UNRESTRICTED — identical behaviour everywhere. central-manager keeps it so no
 * existing organization needs migrating; new ones use UNRESTRICTED. Compare through
 * {@link isUnrestrictedOrgType}, never against either constant directly.
 */
export const ENTERPRISE = 'ENTERPRISE';
export const SELF_SERVICE = 'SELF_SERVICE';

/**
 * Whether an organization bypasses the paywall: any cluster setup, no grant minted first, no
 * payment-method check. Mirrors central-manager's `isUnrestrictedOrgType`, and is the one place the
 * two spellings are reconciled — the backend never cared whether an org was "enterprise" as a
 * segment, only whether it is unrestricted, and the type now says what it does.
 */
export function isUnrestrictedOrgType(type: string | null | undefined): boolean {
	return type === UNRESTRICTED || type === ENTERPRISE;
}

interface TermsOrganization {
	type?: string | null;
	clusters?:
		| ReadonlyArray<
			{ id?: string | null; commercialSource?: string | null; grant?: { source?: string | null } | null }
		>
		| null;
}

/**
 * Mirrors central-manager's `onContractedTerms`: an unrestricted organization's cluster runs on its
 * contract unless staff moved that one cluster onto paid terms (`commercialSource`). A cluster not
 * created yet runs on the organization's terms.
 */
export function onContractedTerms(organization: TermsOrganization | null | undefined, clusterId?: string): boolean {
	if (!isUnrestrictedOrgType(organization?.type)) { return false; }
	const cluster = clusterId ? organization?.clusters?.find((candidate) => candidate.id === clusterId) : undefined;
	return cluster?.commercialSource !== 'purchased';
}

/**
 * Whether Stripe bills the organization for anything, now or before: a cluster moved onto paid terms, or
 * one paid for before the organization became unrestricted.
 */
export function billedThroughStripe(organization: TermsOrganization | null | undefined): boolean {
	if (!isUnrestrictedOrgType(organization?.type)) { return true; }
	return (organization?.clusters ?? []).some((cluster) =>
		cluster.commercialSource === 'purchased' || cluster.grant?.source === 'purchased'
	);
}
