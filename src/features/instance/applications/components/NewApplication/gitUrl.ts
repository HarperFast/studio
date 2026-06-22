/**
 * Helpers for reasoning about the host segment of a git remote URL. Used by the import flow to
 * verify that the entered URL targets the same host alias as the selected SSH key (issue #1318):
 * SSH auth resolves the key purely from the host in the URL, so a mismatch silently fails to
 * authenticate.
 */

const SCHEME_PREFIX = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const SCP_LIKE = /^(?:[^@/]+@)?([^/:]+):/;

/**
 * Extract the host from a git remote URL, supporting the shapes the import flow accepts:
 * - scp-like:  `git@github.com:org/repo.git`       -> `github.com`
 * - ssh url:   `ssh://git@github.com:22/org/repo`  -> `github.com`
 * - https url: `https://github.com/org/repo.git`   -> `github.com`
 *
 * Returns `null` for anything without a detectable host (e.g. a bare npm package reference).
 */
export function extractGitUrlHost(ref: string): string | null {
	const trimmed = ref.trim();
	if (!trimmed) {
		return null;
	}
	if (SCHEME_PREFIX.test(trimmed)) {
		try {
			return new URL(trimmed).hostname || null;
		} catch {
			return null;
		}
	}
	const scpMatch = SCP_LIKE.exec(trimmed);
	return scpMatch ? scpMatch[1] : null;
}

/**
 * Replace the host segment of `ref` with `newHost`, preserving the user, port, and path. Returns
 * the (trimmed) reference unchanged when no host can be detected.
 */
export function replaceGitUrlHost(ref: string, newHost: string): string {
	const trimmed = ref.trim();
	const oldHost = extractGitUrlHost(trimmed);
	if (!oldHost) {
		return ref;
	}
	const escaped = oldHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	// The host sits at the start of the string, or after `@` (userinfo) or `//` (scheme), and is
	// followed by `:` (port/path), `/` (path), or the end of the string.
	const hostPattern = new RegExp(`(^|@|//)${escaped}(?=[:/]|$)`);
	return trimmed.replace(hostPattern, `$1${newHost}`);
}
