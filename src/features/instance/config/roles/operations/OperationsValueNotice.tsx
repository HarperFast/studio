/**
 * Shown wherever a role's `operations` key holds something that isn't a usable allowlist. The two
 * kinds fail very differently, verified against harper v5.2.2's compiled code:
 *
 * - `breaks-auth` — a non-iterable value (a table-permission record, `true`, a number). `listUsers`
 *   expands every assigned role's allowlist at cache-load time behind a truthiness-only guard, so
 *   the `for…of` throws and the cache load rejects: authentication fails for every user on the
 *   instance, not just this role's holder. Assignment is the trigger, since only assigned roles are
 *   expanded.
 * - `malformed` — anything else the gate still enters on, since it tests `operations !== undefined`:
 *   a bare string (which expands to its characters, so every operation is denied), an array with
 *   non-string members, or a falsy value (which the cache-load guard skips, so it throws per
 *   request instead of at startup). Wrong in every case, but never an instance-wide outage.
 */
export function OperationsValueNotice({
	kind,
	assigning,
	databaseCollision,
}: {
	kind: 'breaks-auth' | 'malformed';
	/** The value is a table-permission record, so a database of that name is the other half. */
	databaseCollision?: boolean;
	/** Rendered next to a role picker rather than the JSON editor, so the remedy differs. */
	assigning?: boolean;
}) {
	if (kind === 'malformed') {
		return (
			<p className="text-xs text-destructive">
				This role's <span className="font-mono">operations</span>{' '}
				value is not a list of operation names. Harper still gates on it: a string is read one character at a time, so
				every operation is denied; an array with non-string members enforces whatever it does expand to; and a falsy
				value makes each of this role's requests fail outright. The role cannot be saved again until it is fixed.{' '}
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
						key in the JSON below — that alone restores authentication.{databaseCollision && (
							<>
								{' '}Separately, and only if this instance needs allowlists at all: a database named{' '}
								<span className="font-mono">operations</span>{' '}
								stops every role from using one. Retiring it means migrating its data and table grants to a
								differently-named database and verifying them there first — dropping it destroys whatever it holds, so
								treat that as a planned migration rather than part of this repair.
							</>
						)}
					</>
				)}
		</p>
	);
}
