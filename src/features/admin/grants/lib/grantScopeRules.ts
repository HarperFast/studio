/**
 * Whether changing a scope from `before` to `after` narrows it.
 *
 * central-manager refuses a narrowing on a grant already bound to a cluster (409): it changes
 * nothing until that cluster's next plan change and then converts it to paid, so the consequence
 * lands far from the decision. Revoking and re-minting says the same thing where the audit log can
 * see it.
 *
 * `null`/absent is unrestricted, which makes it the *widest* value either side can hold — so
 * clearing a scope always widens, and putting a first restriction on an unscoped grant is the
 * largest narrowing there is, even though no entry was removed. The form models unrestricted as an
 * empty array, which is why `after` is a plain array while `before` carries the server's null.
 */
export function narrowsScope(before: string[] | null | undefined, after: string[]): boolean {
	if (after.length === 0) { return false; }
	if (before == null) { return true; }
	return !before.every((id) => after.includes(id));
}
