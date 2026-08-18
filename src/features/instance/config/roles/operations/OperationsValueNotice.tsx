/**
 * Shown wherever a role's `operations` key holds something that isn't a usable allowlist. The two
 * kinds fail very differently, verified against harper v5.2.2's compiled code:
 *
 * - `breaks-auth` — a non-iterable value (a table-permission record, `true`, a number). `listUsers`
 *   expands every assigned role's allowlist at cache-load time behind a truthiness-only guard, so
 *   the `for…of` throws and the cache load rejects: authentication fails for every user on the
 *   instance, not just this role's holder. Assignment is the trigger, since only assigned roles are
 *   expanded.
 * - `malformed` — iterable but not a list of names (a bare string, an array with non-strings).
 *   These expand without throwing, but the gate is live either way: it enters on `operations !==
 *   undefined` and denies anything outside the expanded set, so a bare string (which expands to its
 *   characters) denies every operation. Only add_role/alter_role reject the value outright.
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
				value is not a list of operation names. Harper still gates on it, so this role's users can run only whatever it
				happens to expand to — nothing at all, for a bare string — and the role cannot be saved again until it is fixed.
				{' '}
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
						<span className="font-mono">operations</span> key in the JSON below, then drop the{' '}
						<span className="font-mono">operations</span>{' '}
						database — while one exists, no role on this instance can use an allowlist at all. To keep the table grants,
						move them to a differently-named database and re-key them here first.
					</>
				)}
		</p>
	);
}
