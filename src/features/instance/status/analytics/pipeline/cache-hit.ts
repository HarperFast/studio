// Thin re-export — this metric is defined in the `wrapperMetrics` factory
// table (wrapperMetrics.tsx). Kept so existing import paths stay stable.
import { wrapperMetrics } from './wrapperMetrics';

export const cacheHitSpec = wrapperMetrics['cache-hit'].spec;
export const CacheHitRenderer = wrapperMetrics['cache-hit'].Renderer;
