import type { MetricSpec } from '../types/analytics';

type Confidence = NonNullable<MetricSpec['confidence']>;
export type ConfidenceClass = 'ok' | 'grey' | 'suppress';

/** Classify a post-aggregation window count.
 *
 * When both thresholds are provided:
 *   count >= suppressBelow → 'ok'
 *   greyBelow <= count < suppressBelow → 'grey'
 *   count < greyBelow → 'suppress'
 *
 * When only suppressBelow is set, the grey tier is disabled: counts below
 * suppressBelow go straight to 'suppress' (greyBelow collapses to
 * suppressBelow, leaving no grey band).
 *
 * When only greyBelow is set, the suppress tier is disabled: counts below
 * greyBelow become 'grey' and never 'suppress'.
 *
 * No rule → 'ok'.
 */
export function classifyConfidence(
	count: number | undefined,
	rule: Pick<Confidence, 'greyBelow' | 'suppressBelow'> | undefined,
): ConfidenceClass {
	if (!rule) { return 'ok'; }
	if (count === undefined) { return 'suppress'; }
	const { suppressBelow, greyBelow } = rule;
	// Check suppress tier: only if suppressBelow is set and count is below it.
	if (suppressBelow !== undefined && count < suppressBelow) {
		// If greyBelow is also set and count is still >= greyBelow, it's grey
		// (in the band between greyBelow and suppressBelow). Otherwise suppress.
		if (greyBelow !== undefined && count >= greyBelow) { return 'grey'; }
		return 'suppress';
	}
	// If we passed the suppress check (or no suppress tier), check grey tier.
	if (greyBelow !== undefined && count < greyBelow) { return 'grey'; }
	return 'ok';
}
