import { SchemaPlan } from '@/integrations/api/api.gen';
import { ClusterGrant, GrantShapeEntry } from '@/integrations/api/api.patch';

/** Plan-and-region pairs keyed as central-manager's shapeKeys does: one key per pair, never merged. */
const pairKeys = (pairs: ReadonlyArray<{ planId: string; regionId?: string | null }>) =>
	pairs.map((pair) => `${pair.planId}@${pair.regionId ?? '-'}`).sort();

/**
 * Whether a comp's shape covers exactly this request: the same pairs, as many of each, nothing more
 * or less. That is the test central-manager applies before waiving the card; anything else converts
 * the cluster to paid. A self-hosted request carries one pair per instance, so `regionIds` must too
 * (a null each). An unresolved region (undefined) covers nothing.
 */
export function shapeCoversRequest(
	shape: GrantShapeEntry[] | null | undefined,
	planId: string | undefined,
	regionIds: ReadonlyArray<string | null | undefined>,
): boolean {
	if (!shape?.length || !planId || regionIds.some((id) => id === undefined)) { return false; }
	const wanted = pairKeys(shape);
	const offered = pairKeys(regionIds.map((regionId) => ({ planId, regionId })));
	return wanted.length === offered.length && wanted.every((key, i) => key === offered[i]);
}

export interface TrialScope {
	/** Plans the trial may run on; null for any trial plan. */
	planIds: string[] | null;
	/** Regions it may run in; null for any. */
	regionIds: string[] | null;
}

/**
 * A trial's allow-lists, which central-manager enforces at claim. Only a trial scopes this way: a
 * comp is pinned by its shape. Null for a trial with no list at all.
 */
export function trialScope(
	grant: Pick<ClusterGrant, 'source' | 'allowedPlanIds' | 'allowedRegionIds'> | null | undefined,
): TrialScope | null {
	if (grant?.source !== 'trial') { return null; }
	const planIds = grant.allowedPlanIds?.length ? grant.allowedPlanIds : null;
	const regionIds = grant.allowedRegionIds?.length ? grant.allowedRegionIds : null;
	return planIds || regionIds ? { planIds, regionIds } : null;
}

/**
 * The regions a row may pick: the plan's own list narrowed by the grant's, whichever exist. When
 * the two share nothing the grant's list wins — it is the contract the server checks the claim
 * against, and listing everything would only move the refusal to submit.
 */
export function allowedRegionIdsFor(
	plan: Pick<SchemaPlan, 'allowedRegionIds'> | undefined,
	scope: TrialScope | null,
): string[] | undefined {
	const byPlan = plan?.allowedRegionIds?.length ? plan.allowedRegionIds : undefined;
	const byGrant = scope?.regionIds ?? undefined;
	if (!byPlan || !byGrant) { return byGrant ?? byPlan; }
	const both = byPlan.filter((id) => byGrant.includes(id));
	return both.length ? both : byGrant;
}
