/**
 * Shown wherever a role's `operations` key holds something Harper cannot expand — typically table
 * permissions on a database of that name, carried through a v4 upgrade.
 *
 * This is not a cosmetic problem. From v5.0.0-alpha.8 (the version that introduced the allowlist,
 * so the whole range this renders for), `listUsers` calls `cacheExpandedOperationsPerms` for every
 * user, whose guard is truthiness-only; a non-array value reaches `expandOperationsPerms`, whose
 * `for…of` throws. That rejects the user-cache load for the entire instance, so authentication
 * fails for every user — not only the one holding this role. Only roles actually assigned to a user
 * are expanded, which is why assigning one is the trigger.
 */
export function OperationsCollisionNotice({ assigning }: { assigning?: boolean }) {
	return (
		<p className="text-xs text-destructive">
			This role's <span className="font-mono">operations</span>{' '}
			value is not a list of operation names — most often table permissions on a database of that name, kept from an
			older Harper. This version cannot expand it, and {assigning
				? 'assigning this role to a user breaks authentication for every user on the instance'
				: 'authentication breaks for every user on the instance as soon as a user holds this role'}. Remove the{' '}
			<span className="font-mono">operations</span>{' '}
			key in the JSON below; to keep the table grants, move them to a differently-named database and re-key them there
			first.
		</p>
	);
}
