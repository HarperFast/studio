// Derived metrics recompute from raw source-metric columns. They DO NOT read
// the source spec's aggregator output; they implement their own Σ-arithmetic
// to avoid the ratio-of-ratios bug documented in the spec. Step 3 populates
// this registry with `mqtt-traffic-sent` / `mqtt-traffic-received` (msg/sec
// views derived from `bytes-sent` / `bytes-received` source records).
// Step 6A adds `request-rate` (from `duration`) and `error-rate` (from
// `success`) — the first derived metrics that read raw columns directly
// instead of delegating to runPipeline.
import type { DerivedMetricSpec } from '../../types/analytics';
import { errorRateDerived } from './error-rate';
import { mqttTrafficReceivedDerived, mqttTrafficSentDerived } from './mqtt-traffic';
import { requestRateDerived } from './request-rate';
import { transactionLogGrowthDerived } from './transaction-log-growth';

export const derivedRegistry: Record<string, DerivedMetricSpec> = {
	'mqtt-traffic-sent': mqttTrafficSentDerived,
	'mqtt-traffic-received': mqttTrafficReceivedDerived,
	'request-rate': requestRateDerived,
	'error-rate': errorRateDerived,
	'transaction-log-growth': transactionLogGrowthDerived,
};
