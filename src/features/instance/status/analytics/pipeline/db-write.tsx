// Thin re-export — this metric is defined in the `wrapperMetrics` factory
// table (wrapperMetrics.tsx). Kept so existing import paths stay stable.
import { wrapperMetrics } from './wrapperMetrics.tsx';

export const dbWriteSpec = wrapperMetrics['db-write'].spec;
export const DbWriteRenderer = wrapperMetrics['db-write'].Renderer;
