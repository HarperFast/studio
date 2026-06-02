import { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';

export type UsageScale = {
	readRate: number;
	totalReads: number;
	writeRate: number;
	totalWrites: number;
};

/**
 * Determines a sensible upper bound for the usage gauges by looking across every performance tier and
 * distribution (region) available for the deployment. Read values scale with a region's
 * purchasedBlockMultiplier, so we use the largest multiplier available; write values do not scale.
 * The result lets each gauge fill proportionally — higher tiers/distributions push the bars closer to full.
 */
export function calculateUsageScale(
	deploymentPlans: SchemaPlan[],
	regionNameToLatencyToRegion: Record<string, Record<string, SchemaRegion>>,
): UsageScale {
	const maxMultiplier = Object.values(regionNameToLatencyToRegion)
		.flatMap(latencyToRegion => Object.values(latencyToRegion))
		.reduce((max, region) => Math.max(max, region.purchasedBlockMultiplier ?? 1), 1);

	const max = (pick: (plan: SchemaPlan) => number | undefined) =>
		deploymentPlans.reduce((acc, plan) => Math.max(acc, pick(plan) ?? 0), 0);

	return {
		readRate: max(plan => plan.planLimits?.readsPerMinuteCount) * maxMultiplier,
		totalReads: max(plan => plan.planLimits?.totalReadCount) * maxMultiplier,
		writeRate: max(plan => plan.planLimits?.writesPerMinuteCount),
		totalWrites: max(plan => plan.planLimits?.totalWriteCount),
	};
}
