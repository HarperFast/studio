/**
 * Inline "how do I read this secret?" code examples for the two hdb_secret delivery tiers
 * (harper#1554 / harper#1559). The tier a secret is stored under decides how component code reads
 * it, so the UI shows the matching snippet as soon as the tier is picked:
 *
 *  - 'processEnv' — the value is materialized into the real `process.env` at component load and
 *    inherited by child processes (global, `.env` semantics). Read it as `process.env.NAME`.
 *  - 'scoped'     — never placed on `process.env`; exposed only to granted components through the
 *    `secrets` accessor (`import { secrets } from 'harper'`), read at module top level. On this tier
 *    the accessor is live and `secrets.subscribe('NAME')` streams the current value then each
 *    rotation (harper#1787), so the example reads the value immediately, then subscribes in a
 *    background task — module load isn't blocked and the component hot-swaps a rotated secret
 *    without a restart. (The global tier stays reload-only, so its example is just the read.)
 *
 * The two tiers are mutually exclusive server-side (a processEnv secret is global, so scoping it
 * with grants is rejected). The secret-name grammar (`[\w.-]+`) permits `.` and `-`, which aren't
 * valid JS identifiers, so the examples switch between dot/destructure and bracket notation per
 * name to stay copy-paste-correct.
 */

export type SecretTier = 'processEnv' | 'scoped';

/** Shown in the example while the user hasn't typed a name yet. */
export const SECRET_NAME_PLACEHOLDER = 'MY_SECRET';

/** True when `name` can be used as a bare JS identifier (so `secrets.NAME` / `const { NAME }` is valid). */
export function isJsIdentifier(name: string): boolean {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

/** A single-quoted JS string literal for a name that can't be a bare identifier. */
function quote(name: string): string {
	return `'${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * The code a component uses to read a secret of the given tier. `name` is the stored secret name;
 * an empty/whitespace name falls back to {@link SECRET_NAME_PLACEHOLDER} so the example still reads
 * sensibly while the user is typing.
 */
export function buildSecretAccessExample(name: string, tier: SecretTier): string {
	const key = name.trim() || SECRET_NAME_PLACEHOLDER;
	const identifier = isJsIdentifier(key);

	if (tier === 'processEnv') {
		const access = identifier ? `process.env.${key}` : `process.env[${quote(key)}]`;
		return [
			'// Exposed on process.env for every component (and child processes).',
			`const value = ${access};`,
		].join('\n');
	}

	// Scoped: the `secrets` accessor is bound to the loading component, so read it at module top
	// level (during load), not inside a request handler. The accessor is live on this tier, and
	// `secrets.subscribe(name)` streams the current value then each rotation (harper#1787) — so read
	// the value immediately, then subscribe in a fire-and-forget task that never blocks module load.
	const read = identifier ? `secrets.${key}` : `secrets[${quote(key)}]`;
	return [
		"import { secrets } from 'harper';",
		'',
		"// Use the current value right away — read at your module's top level.",
		`let value = ${read};`,
		'',
		'// Then react to rotations without blocking startup. Subscribing in a background',
		'// task lets module load finish, so the rest of your app keeps initializing.',
		'(async () => {',
		'  try {',
		`    for await (const next of secrets.subscribe(${quote(key)})) {`,
		'      if (next === value) continue; // the first yield is the current value you already have',
		'      value = next; // rotated — rebuild anything bound to the secret (e.g. an API client) here',
		'    }',
		'  } catch (error) {',
		'    // Log and keep serving the last value; it stays valid until the next reload.',
		`    console.error('secret subscription ended for', ${quote(key)}, error);`,
		'  }',
		'})();',
	].join('\n');
}
