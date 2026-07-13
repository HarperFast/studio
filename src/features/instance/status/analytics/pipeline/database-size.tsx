// Thin re-export — this metric is defined in the `wrapperMetrics` factory
// table (wrapperMetrics.tsx). Kept so existing import paths stay stable.
import { wrapperMetrics } from './wrapperMetrics.tsx';

export const databaseSizeSpec = wrapperMetrics['database-size'].spec;
export const DatabaseSizeRenderer = wrapperMetrics['database-size'].Renderer;
