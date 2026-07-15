/**
 * Decides what an admin (or the user themselves) may do to an org membership in the Edit User
 * modal. A user belongs to an org only by holding org roles, so removing their last role — or
 * their admin role — is equivalent to removing them from the org.
 *
 * Two edge cases would orphan the organization when acting on yourself, so both block role
 * removal / leaving and show a notice with the real way out:
 *   - sole member: no one would be left in the org at all.
 *   - last admin:  members would remain, but no one could manage them (or the clusters).
 *
 * "Admin" is matched by role name (see `isAdminRoleName`) — a deliberately simple heuristic that
 * needs no per-role permission lookup. It can miss a custom-named admin role; the server remains
 * the source of truth, this is just a guard rail.
 */
export interface OrgUserRemovalPolicy {
	/** Whether individual role checkboxes may be unchecked (i.e. roles removed). */
	canRemoveRoles: boolean;
	/** Whether to show the explicit "Remove from organization" / "Leave organization" action. */
	showRemovalAction: boolean;
	/** Why removal is blocked for the acting user, if it is — drives which notice to show. */
	blockedReason: 'sole-member' | 'last-admin' | null;
}

/** A role grants org administration if it is literally named "admin" (case-insensitive). */
export function isAdminRoleName(roleName: string | undefined): boolean {
	return roleName?.trim().toLowerCase() === 'admin';
}

export function getOrgUserRemovalPolicy({
	canDelete,
	isSelf,
	orgUserCount,
	adminCount,
	isAdmin,
	roleCount,
}: {
	/** The acting user has the org-role delete permission. */
	canDelete: boolean;
	/** The membership being edited is the acting user's own. */
	isSelf: boolean;
	/** Number of distinct members in the organization. */
	orgUserCount: number;
	/** Number of distinct members holding an admin role. */
	adminCount: number;
	/** The edited user holds an admin role. */
	isAdmin: boolean;
	/** Number of roles the edited user currently holds in the org. */
	roleCount: number;
}): OrgUserRemovalPolicy {
	const isSoleMember = isSelf && orgUserCount <= 1;
	const isLastAdmin = isSelf && isAdmin && adminCount <= 1;
	// Sole-member takes priority: with no one else in the org, promoting another admin isn't an
	// option, so we point them at deleting the org rather than at handing off admin.
	const blockedReason = !canDelete ? null : isSoleMember ? 'sole-member' : isLastAdmin ? 'last-admin' : null;
	const canRemoveRoles = canDelete && blockedReason === null;
	return {
		canRemoveRoles,
		showRemovalAction: canRemoveRoles && roleCount > 0,
		blockedReason,
	};
}
