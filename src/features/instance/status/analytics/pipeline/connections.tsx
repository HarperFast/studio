// Thin re-export — this metric is defined in the `wrapperMetrics` factory
// table (wrapperMetrics.tsx). Kept so existing import paths stay stable.
import { wrapperMetrics } from './wrapperMetrics.tsx';

export const connectionsSpec = wrapperMetrics['connections'].spec;
export const ConnectionsRenderer = wrapperMetrics['connections'].Renderer;
