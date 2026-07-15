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
		// The client is memoized per route mount (useInstanceClientIdParams),
		// so this dep is inert today — it exists so a future client rebuild
		// with the same entityId propagates instead of serving a stale one.
		value.instanceParams.instanceClient,
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

/** Recharts sync props for a cartesian chart on a Status tab: the tab-scoped
 *  syncId plus syncMethod="value" (matches crosshairs by x value; the default
 *  index-based sync mis-aligns sparse series that don't share point counts).
 *  Pass `inDialog: true` from the expand-to-fullscreen dialog — syncing dialog
 *  charts with the tab would ghost-drive the panels behind the overlay, so
 *  the dialog gets its own `:expanded` scope instead: a SmallMultiples panel
 *  expands to several mini-charts that keep syncing with each other, while a
 *  single-chart dialog is a harmless sync group of one. Returns an empty
 *  object when no syncId is in context so charts rendered standalone (tests,
 *  future reuse) simply don't sync. */
export function useChartSyncProps(inDialog: boolean): { syncId?: string; syncMethod?: 'value' } {
	const tabSyncId = useAnalyticsSyncId();
	return tabSyncId !== undefined
		? { syncId: inDialog ? `${tabSyncId}:expanded` : tabSyncId, syncMethod: 'value' }
		: {};
}
