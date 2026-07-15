import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import type { TimeRange } from '../types/analytics';

export interface AnalyticsContextValue {
	timeRange: TimeRange;
	bucketMs: number;
	instanceParams: InstanceClientIdConfig & InstanceTypeConfig;
	/** Recharts syncId shared by every cartesian chart on the current Status
	 *  tab so hovering one panel shows a synchronized crosshair/tooltip on
	 *  the others (they share an x-domain). Keyed per instance+tab
	 *  (`${entityId}:${tab}`) so two instances' Status pages, or two tabs,
	 *  never sync with each other. */
	syncId?: string;
}

const Ctx = createContext<AnalyticsContextValue | null>(null);

interface ProviderProps {
	value: AnalyticsContextValue;
	children: ReactNode;
}

export function AnalyticsProvider({ value, children }: ProviderProps) {
	const memo = useMemo(() => value, [
		value.timeRange.startTime,
		value.timeRange.endTime,
		value.bucketMs,
		value.instanceParams.entityId,
		value.syncId,
	]);
	return <Ctx.Provider value={memo}>{children}</Ctx.Provider>;
}

export function useAnalyticsContext(): AnalyticsContextValue {
	const v = useContext(Ctx);
	if (!v) { throw new Error('useAnalyticsContext must be used inside <AnalyticsProvider>'); }
	return v;
}

/** Tab-scoped Recharts syncId, or undefined when rendering outside an
 *  <AnalyticsProvider> (or one that doesn't set it). Non-throwing on purpose:
 *  the chart primitives are also rendered standalone (tests, future reuse)
 *  and must not require the provider just to skip syncing. */
export function useAnalyticsSyncId(): string | undefined {
	return useContext(Ctx)?.syncId;
}
