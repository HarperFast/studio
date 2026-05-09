import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig.ts';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnalyticsOnboardingHint } from './components/AnalyticsOnboardingHint.tsx';
import { TimeRangePicker } from './components/TimeRangePicker.tsx';
import { type AnalyticsContextValue, AnalyticsProvider } from './context/AnalyticsContext.tsx';
import { DEFAULT_PRESET_ID, DEFAULT_REFRESH_MS, getPreset, type TimePresetId } from './context/timePresets.ts';
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

const TAB_DEFS = [
	{ id: 'health', label: 'Health' },
	{ id: 'traffic', label: 'Traffic' },
	{ id: 'requests', label: 'Requests' },
	{ id: 'database', label: 'Database' },
	{ id: 'replication', label: 'Replication' },
	{ id: 'storage', label: 'Storage' },
	{ id: 'overview', label: 'Overview' },
] as const;

type TabId = (typeof TAB_DEFS)[number]['id'];

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
	const initial = readSearchParams();
	const [tab, setTab] = useState<TabId>(initial.tab);
	const [presetId, setPresetId] = useState<TimePresetId>(initial.presetId);
	const [refreshMs, setRefreshMs] = useState<number>(initial.refreshMs);
	// Manual refresh ticks bump this to force a fresh window when the user
	// clicks the refresh button.
	const [tick, setTick] = useState(0);

	const { resolvedTheme } = useTheme();
	const theme = resolvedTheme === 'dark' ? 'dark' : 'light';

	const updatePreset = useCallback((id: TimePresetId) => {
		setPresetId(id);
		writeSearchParams({ tab, presetId: id, refreshMs });
	}, [tab, refreshMs]);

	const updateTab = useCallback((id: TabId) => {
		setTab(id);
		writeSearchParams({ tab: id, presetId, refreshMs });
	}, [presetId, refreshMs]);

	const updateRefreshMs = useCallback((ms: number) => {
		setRefreshMs(ms);
		writeSearchParams({ tab, presetId, refreshMs: ms });
	}, [tab, presetId]);

	// Keep state in sync when the user uses the back/forward buttons —
	// otherwise the URL says one tab and the page renders a different one.
	useEffect(() => {
		const onPop = () => {
			const next = readSearchParams();
			setTab(next.tab);
			setPresetId(next.presetId);
			setRefreshMs(next.refreshMs);
		};
		window.addEventListener('popstate', onPop);
		return () => window.removeEventListener('popstate', onPop);
	}, []);

	const ctxValue = useMemo<AnalyticsContextValue>(() => {
		const preset = getPreset(presetId);
		const endTime = Date.now();
		const startTime = endTime - preset.durationMs;
		// `tick` participates in memo deps so a manual refresh produces a fresh
		// window even if the user did not change presets.
		void tick;
		return {
			timeRange: { startTime, endTime },
			bucketMs: preset.bucketMs,
			refreshIntervalMs: refreshMs,
			theme,
			instanceParams,
		};
	}, [presetId, refreshMs, theme, instanceParams, tick]);

	const showTimePicker = tab !== 'overview';
	const picker = showTimePicker
		? (
			<TimeRangePicker
				presetId={presetId}
				onPresetChange={updatePreset}
				refreshMs={refreshMs}
				onRefreshChange={updateRefreshMs}
				onManualRefresh={() => setTick((t) => t + 1)}
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

interface SearchState {
	tab: TabId;
	presetId: TimePresetId;
	refreshMs: number;
}

const VALID_PRESETS: readonly string[] = ['1h', '6h', '24h', '7d', '30d'];
const VALID_REFRESH: readonly number[] = [0, 30_000, 60_000, 300_000];

function readSearchParams(): SearchState {
	if (typeof window === 'undefined') {
		return { tab: 'health', presetId: DEFAULT_PRESET_ID, refreshMs: DEFAULT_REFRESH_MS };
	}
	const sp = new URLSearchParams(window.location.search);
	const tab = sp.get('tab') as TabId | null;
	const presetId = sp.get('range') as TimePresetId | null;
	const refreshRaw = sp.get('refresh');
	const refreshMs = refreshRaw !== null && VALID_REFRESH.includes(Number(refreshRaw))
		? Number(refreshRaw)
		: DEFAULT_REFRESH_MS;
	return {
		tab: TAB_DEFS.some((t) => t.id === tab) ? (tab as TabId) : 'health',
		presetId: presetId && VALID_PRESETS.includes(presetId)
			? presetId
			: DEFAULT_PRESET_ID,
		refreshMs,
	};
}

function writeSearchParams(state: SearchState) {
	if (typeof window === 'undefined') { return; }
	const sp = new URLSearchParams(window.location.search);
	sp.set('tab', state.tab);
	sp.set('range', state.presetId);
	sp.set('refresh', String(state.refreshMs));
	const next = `${window.location.pathname}?${sp.toString()}${window.location.hash}`;
	// pushState (not replace) so users can back-button between tabs and
	// shared-state ranges without losing their place in browser history.
	window.history.pushState(null, '', next);
}
