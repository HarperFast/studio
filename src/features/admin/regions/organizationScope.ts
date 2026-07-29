/**
 * Resolves what a region's `organizationIds` should be on save.
 *
 * `null` is public; `[]` is the opposite — Region.get reads it as "scoped to these zero orgs", so no
 * organization can select the region. The picker can't represent that difference (both are an empty
 * selection), so an untouched field resubmits whatever was stored instead of collapsing to `null`.
 * Without that, editing an unrelated field on a `[]` region would silently make it public.
 */
export function resolveOrganizationScope(
	selected: string[],
	stored: string[] | null | undefined,
	touched: boolean,
): string[] | null {
	if (selected.length > 0) {
		return selected;
	}
	// Cleared on purpose ⇒ public. Never touched ⇒ keep what was there.
	return touched ? null : stored ?? null;
}
