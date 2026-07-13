// Thin re-export — this metric is defined in the `wrapperMetrics` factory
// table (wrapperMetrics.tsx). Kept so existing import paths stay stable.
import { wrapperMetrics } from './wrapperMetrics.tsx';

export const cpuUsageSpec = wrapperMetrics['cpu-usage'].spec;
export const CpuUsageRenderer = wrapperMetrics['cpu-usage'].Renderer;
