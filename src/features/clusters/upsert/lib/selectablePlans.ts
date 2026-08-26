import { SchemaPlan } from '@/integrations/api/api.gen';

/**
 * Which plans a customer may move onto, keyed by performance tier.
 *
 * A free managed plan is granted, never chosen: the trial is issued at signup and cannot be
 * re-entered, so offering it while editing an existing cluster advertises a change central-manager
 * would refuse. Creating a cluster is the one case where a free plan IS the offer, so nothing is
 * filtered there.
 *
 * Keyed on price rather than a plan id so a catalogue rename can't quietly re-admit it. Self-hosted
 * plans are exempt — their free tier is a real ongoing plan, not a trial.
 *
 * The cluster's current plan always stays listed, or a customer still on the trial would open the
 * editor to an empty picker instead of seeing what they are on.
 */
export function selectablePlansByTier(
	plansByTier: Record<string, SchemaPlan>,
	{ isExistingCluster, currentPlanId }: { isExistingCluster: boolean; currentPlanId?: string },
): Record<string, SchemaPlan> {
	if (!isExistingCluster) { return plansByTier; }
	return Object.fromEntries(
		Object.entries(plansByTier).filter(([, plan]) =>
			!!plan.priceUsd || plan.deploymentType === 'self-hosted' || plan.id === currentPlanId
		),
	);
}
