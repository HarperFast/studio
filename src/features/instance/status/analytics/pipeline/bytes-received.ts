// Thin re-export — this metric is defined in the `wrapperMetrics` factory
// table (wrapperMetrics.tsx). Kept so existing import paths stay stable.
import { wrapperMetrics } from './wrapperMetrics';

export const bytesReceivedSpec = wrapperMetrics['bytes-received'].spec;
export const BytesReceivedRenderer = wrapperMetrics['bytes-received'].Renderer;
