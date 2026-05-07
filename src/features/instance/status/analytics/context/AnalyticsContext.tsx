import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig.ts';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import type { TimeRange } from '../types/analytics.ts';

export type AnalyticsTheme = 'light' | 'dark';

export interface AnalyticsContextValue {
	timeRange: TimeRange;
	bucketMs: number;
	refreshIntervalMs: number;
	theme: AnalyticsTheme;
	instanceParams: InstanceClientIdConfig & InstanceTypeConfig;
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
		value.refreshIntervalMs,
		value.theme,
		value.instanceParams.entityId,
	]);
	return <Ctx.Provider value={memo}>{children}</Ctx.Provider>;
}

export function useAnalyticsContext(): AnalyticsContextValue {
	const v = useContext(Ctx);
	if (!v) { throw new Error('useAnalyticsContext must be used inside <AnalyticsProvider>'); }
	return v;
}
