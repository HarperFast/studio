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
