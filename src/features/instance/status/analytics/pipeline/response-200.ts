// Thin re-export — this metric is defined in the `wrapperMetrics` factory
// table (wrapperMetrics.tsx). Kept so existing import paths stay stable.
import { wrapperMetrics } from './wrapperMetrics';

export const response200Spec = wrapperMetrics['response_200'].spec;
export const Response200Renderer = wrapperMetrics['response_200'].Renderer;
