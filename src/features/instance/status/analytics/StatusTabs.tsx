import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig.ts';
import { useSystemTheme } from '@/hooks/useSystemTheme';
import { ANALYTICS_QUERY_KEY_PREFIX } from '@/integrations/api/instance/status/getAnalytics.ts';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type StatusTabId, validateStatusSearch } from '../statusSearch.ts';
import { AnalyticsOnboardingHint } from './components/AnalyticsOnboardingHint.tsx';
import { TimeRangePicker } from './components/TimeRangePicker.tsx';
import { type AnalyticsContextValue, AnalyticsProvider } from './context/AnalyticsContext.tsx';
import { getPreset, type TimePresetId } from './context/timePresets.ts';
import { useAnalyticsCapability } from './hooks/useAnalyticsCapability.ts';
import { DatabaseTab } from './tabs/DatabaseTab.tsx';
import { HealthTab } from './tabs/HealthTab.tsx';
import { OverviewTab } from './tabs/OverviewTab.tsx';
import { ReplicationTab } from './tabs/ReplicationTab.tsx';
import { RequestsTab } from './tabs/RequestsTab.tsx';
import { StorageTab } from './tabs/StorageTab.tsx';
import { TrafficTab } from './tabs/TrafficTab.tsx';

interface Props {
	instanceParams: InstanceClientIdConfig & InstanceTypeConfig;
	isLocalStudio: boolean;
}

// Labels for the tab ids the route's search schema defines; `satisfies`
// keeps this list and STATUS_TAB_IDS from drifting apart.
const TAB_DEFS = [
	{ id: 'health', label: 'Health' },
	{ id: 'traffic', label: 'Traffic' },
	{ id: 'requests', label: 'Requests' },
	{ id: 'database', label: 'Database' },
	{ id: 'replication', label: 'Replication' },
	{ id: 'storage', label: 'Storage' },
	{ id: 'overview', label: 'Overview' },
] as const satisfies readonly { id: StatusTabId; label: string }[];

type TabId = StatusTabId;

export function StatusTabs({ instanceParams, isLocalStudio }: Props) {
	const capability = useAnalyticsCapability(instanceParams);

	if (capability.isLoading) {
		return (
			<div role="status" aria-live="polite" className="px-4 py-8 text-sm text-muted-foreground">
				Checking analytics availability…
			</div>
		);
	}

	if (capability.error) {
		return (
			<div role="alert" className="px-4 py-8 text-sm text-muted-foreground">
				<p className="mb-1 font-medium text-foreground">Analytics unavailable on this instance.</p>
				<p>
					The Harper instance returned an error from{' '}
					<code>get_analytics</code>. Check that the instance is reachable and that analytics is enabled, then reload.
				</p>
			</div>
		);
	}

	return (
		<StatusTabsInner
			instanceParams={instanceParams}
			isLocalStudio={isLocalStudio}
		/>
	);
}

function StatusTabsInner({ instanceParams, isLocalStudio }: Props) {
	const navigate = useNavigate();
	// The route's validateSearch already normalized these; re-validating here
	// only narrows the `strict: false` typing to the same single source of
	// truth (statusSearch.ts) instead of hand-rolled casts.
	const raw = useSearch({ strict: false });
	const { tab, range: presetId, refresh: refreshMs } = validateStatusSearch(raw as Record<string, unknown>);

	// The analytics window is a fixed [start, end] snapshot baked into every
	// panel's query key, so "refresh" means sliding the window forward to a
	// new snapshot — re-fetching the old one could only return the same data.
	// `tick` bumps recompute the window below; the interval drives it when
	// auto-refresh is on, and the manual refresh button shares the same path.
	const [tick, setTick] = useState(0);
	const queryClient = useQueryClient();
	const lastRefreshRef = useRef(Date.now());
	const refresh = useCallback(() => {
		lastRefreshRef.current = Date.now();
		setTick((t) => t + 1);
	}, []);

	useEffect(() => {
		if (refreshMs <= 0) { return; }
		// `tick` in the deps restarts the interval on EVERY refresh (scheduled,
		// manual, or visibility catch-up), so the next scheduled tick is always
		// exactly refreshMs after the last actual refresh — no elapsed-time
		// bookkeeping and no double-fetch when refresh sources land close
		// together.
		void tick;
		// Tick guards:
		//  - hidden tab: fetching for an invisible dashboard is pure load on
		//    the customer's Harper; the visibility handler below catches up
		//    once on return if at least one full period elapsed.
		//  - in-flight: when Harper is slower than the cadence, sliding the
		//    window again would key a fresh POST batch on top of the running
		//    one (new key = no dedupe); skip until the current batch settles.
		//    Scoped to this instance so another instance's open Status page
		//    can't starve our refresh cadence.
		const canTick = () =>
			!document.hidden
			&& queryClient.isFetching({ queryKey: [ANALYTICS_QUERY_KEY_PREFIX, instanceParams.entityId] }) === 0;
		const intervalId = setInterval(() => {
			if (canTick()) { refresh(); }
		}, refreshMs);
		const onVisibilityChange = () => {
			if (canTick() && Date.now() - lastRefreshRef.current >= refreshMs) { refresh(); }
		};
		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => {
			clearInterval(intervalId);
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};
	}, [refreshMs, refresh, queryClient, tick, instanceParams.entityId]);

	const theme = useSystemTheme();

	const updatePreset = useCallback((id: TimePresetId) => {
		void navigate({ to: '.', search: { tab, range: id, refresh: refreshMs } });
	}, [navigate, tab, refreshMs]);

	const updateTab = useCallback((id: TabId) => {
		void navigate({ to: '.', search: { tab: id, range: presetId, refresh: refreshMs } });
	}, [navigate, presetId, refreshMs]);

	const updateRefreshMs = useCallback((ms: number) => {
		void navigate({ to: '.', search: { tab, range: presetId, refresh: ms } });
	}, [navigate, tab, presetId]);

	const ctxValue = useMemo<AnalyticsContextValue>(() => {
		const preset = getPreset(presetId);
		const endTime = Date.now();
		const startTime = endTime - preset.durationMs;
		// `tick` participates in memo deps so every refresh (interval or manual)
		// produces a fresh window even if the user did not change presets.
		void tick;
		return {
			timeRange: { startTime, endTime },
			bucketMs: preset.bucketMs,
			theme,
			instanceParams,
		};
	}, [presetId, theme, instanceParams, tick]);

	const showTimePicker = tab !== 'overview';
	const picker = showTimePicker
		? (
			<TimeRangePicker
				presetId={presetId}
				onPresetChange={updatePreset}
				refreshMs={refreshMs}
				onRefreshChange={updateRefreshMs}
				onManualRefresh={refresh}
			/>
		)
		: null;

	return (
		<AnalyticsProvider value={ctxValue}>
			<Tabs value={tab} onValueChange={(v) => updateTab(v as TabId)} className="px-4 py-2">
				{
					/* Hint applies to chart interactions; hide it on Overview which
				    has none of those affordances. */
				}
				{tab !== 'overview' && <AnalyticsOnboardingHint />}
				{
					/*
					 * Tab strip layout:
					 *   md+   →  horizontal Radix tab strip (no wrap, scrolls horizontally
					 *            if cramped) on the left; sub-toolbar inside each tab
					 *            renders the time-range picker so it stays sticky with
					 *            the chart it controls.
					 *   <md   →  Radix Tabs cannot collapse, so we render a Select for
					 *            tab navigation; the Tabs.List remains hidden but kept
					 *            mounted so TabsContent stays bound to value.
					 */
				}
				<div className="md:hidden mb-3">
					<Select value={tab} onValueChange={(v) => updateTab(v as TabId)}>
						<SelectTrigger className="w-full" aria-label="Select status tab">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{TAB_DEFS.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
						</SelectContent>
					</Select>
				</div>
				<TabsList className="hidden md:inline-flex max-w-full overflow-x-auto mb-4">
					{TAB_DEFS.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
				</TabsList>

				<TabsContent value="health">
					<TabBody picker={picker}>
						<HealthTab />
					</TabBody>
				</TabsContent>
				<TabsContent value="traffic">
					<TabBody picker={picker}>
						<TrafficTab />
					</TabBody>
				</TabsContent>
				<TabsContent value="requests">
					<TabBody picker={picker}>
						<RequestsTab />
					</TabBody>
				</TabsContent>
				<TabsContent value="database">
					<TabBody picker={picker}>
						<DatabaseTab />
					</TabBody>
				</TabsContent>
				<TabsContent value="replication">
					<TabBody picker={picker}>
						<ReplicationTab />
					</TabBody>
				</TabsContent>
				<TabsContent value="storage">
					<TabBody picker={picker}>
						<StorageTab />
					</TabBody>
				</TabsContent>
				<TabsContent value="overview">
					<OverviewTab instanceParams={instanceParams} isLocalStudio={isLocalStudio} />
				</TabsContent>
			</Tabs>
		</AnalyticsProvider>
	);
}

/** Wrap each chart-bearing tab with a sticky sub-toolbar so the time-range
 *  picker stays in view as the user scrolls past long panel grids. The
 *  picker is colocated with the data it controls instead of the tab strip
 *  so its scope is unambiguous. */
function TabBody({ picker, children }: { picker: React.ReactNode; children: React.ReactNode }) {
	return (
		<>
			{picker && (
				<div className="sticky top-0 z-10 -mx-4 px-4 py-2 mb-3 bg-background border-b border-border shadow-sm flex items-center justify-end gap-2">
					{picker}
				</div>
			)}
			{children}
		</>
	);
}
