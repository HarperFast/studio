// Platform-managed components: editing or deleting one takes the instance out of the Akamai
// load balancer. Matched on repo name rather than the full package URL so an org rename cannot
// silently drop the guard.
export const PROTECTED_COMPONENT_REPOS = ['status-check-fabric', 'akamai-status'];

// The name must be a whole segment, so a customer package merely containing one of these
// (`my-akamai-status-probe`) is not locked. Leading `/` or `@` covers git URLs and npm scopes;
// trailing `.`, `#` or `@` covers `.git`, a committish, and a version.
const PROTECTED_PATTERNS = PROTECTED_COMPONENT_REPOS.map((repo) => new RegExp(`(^|[/@])${repo}([.#@]|$)`));

export function isProtectedComponentPackage(packageSpec: string | undefined) {
	return Boolean(packageSpec) && PROTECTED_PATTERNS.some((pattern) => pattern.test(packageSpec!));
}
