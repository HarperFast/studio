// Thin re-export — this metric is defined in the `wrapperMetrics` factory
// table (wrapperMetrics.tsx). Kept so existing import paths stay stable.
import { wrapperMetrics } from './wrapperMetrics';

export const dbReadSpec = wrapperMetrics['db-read'].spec;
export const DbReadRenderer = wrapperMetrics['db-read'].Renderer;
