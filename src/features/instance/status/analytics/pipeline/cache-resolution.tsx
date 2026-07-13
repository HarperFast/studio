// Thin re-export — this metric is defined in the `wrapperMetrics` factory
// table (wrapperMetrics.tsx). Kept so existing import paths stay stable.
import { wrapperMetrics } from './wrapperMetrics.tsx';

export const cacheResolutionSpec = wrapperMetrics['cache-resolution'].spec;
export const CacheResolutionRenderer = wrapperMetrics['cache-resolution'].Renderer;
