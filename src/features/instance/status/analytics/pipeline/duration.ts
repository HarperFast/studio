// Thin re-export — this metric is defined in the `wrapperMetrics` factory
// table (wrapperMetrics.tsx). Kept so existing import paths stay stable.
import { wrapperMetrics } from './wrapperMetrics';

export const durationSpec = wrapperMetrics['duration'].spec;
export const DurationRenderer = wrapperMetrics['duration'].Renderer;
