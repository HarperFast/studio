// Platform-managed components: editing or deleting one takes the instance out of the Akamai
// load balancer. Matched on repo name rather than the full package URL so an org rename cannot
// silently drop the guard, as the HarperDB -> HarperFast move already did once.
export const PROTECTED_COMPONENT_REPOS = ['status-check-fabric', 'akamai-status'];

export function isProtectedComponentPackage(packageSpec: string | undefined) {
	return PROTECTED_COMPONENT_REPOS.some((repo) => packageSpec?.includes(repo));
}
