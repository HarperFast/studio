/**
 * Shown wherever a role's `operations` key holds something that isn't a usable allowlist. The two
 * kinds fail very differently, verified against harper v5.2.2's compiled `expandOperationsPerms`:
 *
 * - `breaks-auth` — a non-iterable value (a table-permission record, `true`, a number). `listUsers`
 *   expands every assigned role's allowlist at cache-load time behind a truthiness-only guard, so
 *   the `for…of` throws and the cache load rejects: authentication fails for every user on the
 *   instance, not just this role's holder. Assignment is the trigger, since only assigned roles are
 *   expanded.
 * - `malformed` — iterable but not a list of names (a bare string, an array with non-strings).
 *   These expand without error — a string per character, extra entries verbatim — so nothing breaks
 *   at runtime; add_role/alter_role simply reject the save. Reachable by ordinary editing, which is
 *   why it must not borrow the fatal wording.
 */
export function OperationsValueNotice({
	kind,
	assigning,
}: {
	kind: 'breaks-auth' | 'malformed';
	/** Rendered next to a role picker rather than the JSON editor, so the remedy differs. */
	assigning?: boolean;
}) {
	if (kind === 'malformed') {
		return (
			<p className="text-xs text-destructive">
				This role's <span className="font-mono">operations</span>{' '}
				value is not a list of operation names, so Harper rejects it as an allowlist.{' '}
				{assigning ? 'Correct it in the role editor.' : 'Correct it in the JSON below.'}
			</p>
		);
	}
	return (
		<p className="text-xs text-destructive">
			This role's <span className="font-mono">operations</span>{' '}
			value is not a list of operation names — most often table permissions on a database of that name, kept from an
			older Harper. This version cannot expand it, and {assigning
				? 'assigning this role to a user breaks authentication for every user on the instance. Pick a different role, and repair this one in the role editor first.'
				: (
					<>
						authentication breaks for every user on the instance as soon as a user holds this role. Remove the{' '}
						<span className="font-mono">operations</span>{' '}
						key in the JSON below. To keep the table grants, move them to a differently-named database, re-key them
						here, and drop the <span className="font-mono">operations</span>{' '}
						database — while one exists, no role on this instance can use an allowlist at all.
					</>
				)}
		</p>
	);
}
