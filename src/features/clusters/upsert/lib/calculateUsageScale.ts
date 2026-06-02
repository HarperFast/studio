import { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';

export type UsageRange = {
	min: number;
	max: number;
};

export type UsageScale = {
	readRate: UsageRange;
	totalReads: UsageRange;
	writeRate: UsageRange;
	totalWrites: UsageRange;
};

/**
 * Determines the floor and ceiling for the usage gauges by looking across every performance tier and
 * distribution (region) available. Read values scale with a region's purchasedBlockMultiplier (so the
 * floor uses the smallest multiplier and the ceiling the largest); write values do not scale.
 * Gauges fill on a logarithmic scale between min and max so that lower tiers (e.g. free → medium) still
 * show a meaningful jump rather than being dwarfed by the largest tiers.
 */
export function calculateUsageScale(
	deploymentPlans: SchemaPlan[],
	regionNameToLatencyToRegion: Record<string, Record<string, SchemaRegion>>,
): UsageScale {
	const multipliers = Object.values(regionNameToLatencyToRegion)
		.flatMap(latencyToRegion => Object.values(latencyToRegion))
		.map(region => region.purchasedBlockMultiplier ?? 1);
	const maxMultiplier = multipliers.reduce((max, value) => Math.max(max, value), 1);
	const minMultiplier = multipliers.reduce((min, value) => Math.min(min, value), maxMultiplier);

	const range = (pick: (plan: SchemaPlan) => number | undefined): UsageRange => {
		const values = deploymentPlans
			.map(pick)
			.filter((value): value is number => typeof value === 'number' && value > 0);
		if (!values.length) {
			return { min: 0, max: 0 };
		}
		return { min: Math.min(...values), max: Math.max(...values) };
	};

	const readRate = range(plan => plan.planLimits?.readsPerMinuteCount);
	const totalReads = range(plan => plan.planLimits?.totalReadCount);

	return {
		readRate: { min: readRate.min * minMultiplier, max: readRate.max * maxMultiplier },
		totalReads: { min: totalReads.min * minMultiplier, max: totalReads.max * maxMultiplier },
		writeRate: range(plan => plan.planLimits?.writesPerMinuteCount),
		totalWrites: range(plan => plan.planLimits?.totalWriteCount),
	};
}

/**
 * Maps a value onto a 0–1 logarithmic fill between the range's floor and ceiling. The log scale keeps
 * the steps between smaller tiers visible instead of compressing everything beneath the largest tier.
 */
export function logarithmicFill(value: number, { min, max }: UsageRange): number {
	if (value <= 0) {
		return 0;
	}
	const floor = Math.max(Math.min(min, value), 1);
	const ceiling = Math.max(max, value);
	if (ceiling <= floor) {
		return 1;
	}
	const fill = (Math.log(value) - Math.log(floor)) / (Math.log(ceiling) - Math.log(floor));
	return Math.min(Math.max(fill, 0), 1);
}
