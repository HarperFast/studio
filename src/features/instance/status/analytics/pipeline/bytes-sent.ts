// Thin re-export — this metric is defined in the `wrapperMetrics` factory
// table (wrapperMetrics.tsx). Kept so existing import paths stay stable.
import { wrapperMetrics } from './wrapperMetrics';

export const bytesSentSpec = wrapperMetrics['bytes-sent'].spec;
export const BytesSentRenderer = wrapperMetrics['bytes-sent'].Renderer;
