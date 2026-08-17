/**
 * Shown wherever a role's `operations` key holds table permissions on an instance that reserves
 * that key for the allowlist — an upgraded v4 role granting a database of that name.
 *
 * The remedy matters as much as the description: Harper still honors these grants
 * (permissionsTranslator's schema loop), and replacing the record with an array makes
 * `perms.operations.tables[t]` throw, failing permission translation for every request that user
 * makes. So this must never read as "fix this value". One component, because the editor and the
 * user-assignment summary both say it and drifting apart is how the destructive wording survived.
 */
export function OperationsCollisionNotice() {
	return (
		<p className="text-xs text-warning">
			This role grants table permissions on a database named{' '}
			<span className="font-mono">operations</span>, which this Harper version reserves for the operations allowlist.
			Those table grants still apply, but the allowlist cannot be managed here. To use both, move these grants to a
			differently-named database and re-key them in the role JSON.
		</p>
	);
}
