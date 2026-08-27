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
 * A free plan survives only while it is the tier currently SHOWING — otherwise the picker would
 * open blank for a customer still on the trial. Once they have moved the selection (or arrived from
 * the upgrade CTA, which preselects the paid target), it drops out: leaving it listed offers a
 * change back onto a plan that cannot be re-entered.
 */
export function selectablePlansByTier(
	plansByTier: Record<string, SchemaPlan>,
	{ isExistingCluster, currentPlanId, selectedPerformance }: {
		isExistingCluster: boolean;
		currentPlanId?: string;
		selectedPerformance?: string;
	},
): Record<string, SchemaPlan> {
	if (!isExistingCluster) { return plansByTier; }
	return Object.fromEntries(
		Object.entries(plansByTier).filter(([tier, plan]) =>
			!!plan.priceUsd
			|| plan.deploymentType === 'self-hosted'
			|| (plan.id === currentPlanId && tier === selectedPerformance)
		),
	);
}
