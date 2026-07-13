// Thin re-export — this metric is defined in the `wrapperMetrics` factory
// table (wrapperMetrics.tsx). Kept so existing import paths stay stable.
import { wrapperMetrics } from './wrapperMetrics.tsx';

export const dbMessageSpec = wrapperMetrics['db-message'].spec;
export const DbMessageRenderer = wrapperMetrics['db-message'].Renderer;
