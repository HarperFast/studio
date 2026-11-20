import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, WheelEvent } from 'react';
import { logKey } from './mergeReadLogs';

type Anchor = { key: string; offset: number };
type Viewport = {
	scope: string;
	reversed: boolean;
	following: boolean;
	userScrolling: boolean;
	anchor: Anchor | null;
	expectedTop: number | null;
	entries: Map<string, ReadLogItem>;
	base?: ReadLogItem[];
	displayed?: ReadLogItem[];
	expanded?: ReadonlySet<string>;
	initialized: boolean;
	jump: boolean;
	padded: boolean;
};

function atEdge(element: HTMLElement, reversed: boolean) {
	return reversed ? element.scrollHeight - element.clientHeight - element.scrollTop <= 2 : element.scrollTop <= 2;
}

function captureAnchor(element: HTMLElement): Anchor | null {
	const buttons = element.querySelectorAll<HTMLButtonElement>('button[data-log-toggle]');
	if (!buttons.length) { return null; }
	const viewport = element.getBoundingClientRect();
	const top = Math.max(viewport.top, element.querySelector('thead')?.getBoundingClientRect().bottom ?? 0);
	let low = 0;
	let high = buttons.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (buttons[middle].closest('tr')!.getBoundingClientRect().top <= top) { low = middle + 1; }
		else { high = middle; }
	}
	const button = buttons[Math.max(0, low - 1)];
	return { key: button.dataset.logToggle!, offset: button.closest('tr')!.getBoundingClientRect().top - viewport.top };
}

export function useLogViewport({ incoming, queryKey, expandedKeys, reversed, node, thread, loading }: {
	incoming: ReadLogItem[];
	queryKey: string;
	expandedKeys: ReadonlySet<string>;
	reversed: boolean;
	node: string;
	thread: string;
	loading: boolean;
}) {
	const scope = JSON.stringify([queryKey, node, thread]);
	const containerRef = useRef<HTMLDivElement>(null);
	const [held, setHeld] = useState<{ scope: string; logs: ReadLogItem[] } | null>(null);
	const [away, setAway] = useState(false);
	const [jumpVersion, setJumpVersion] = useState(0);
	const state = useRef<Viewport>({
		scope,
		reversed,
		following: true,
		userScrolling: false,
		anchor: null,
		expectedTop: null,
		entries: new Map(),
		initialized: false,
		jump: false,
		padded: false,
	});
	const input = useRef({ incoming, scope, loading, reversed });
	input.current = { incoming, scope, loading, reversed };
	const logs = useMemo(() => {
		const previous = state.current;
		const retained = held?.scope === scope && previous.reversed === reversed ? [...held.logs] : [];
		if (previous.scope === scope) {
			for (const key of expandedKeys) {
				const entry = previous.entries.get(key);
				if (entry) { retained.push(entry); }
			}
			const anchor = previous.anchor && previous.entries.get(previous.anchor.key);
			if (anchor && !previous.following) { retained.push(anchor); }
		}
		if (!retained.length) { return incoming; }
		const merged = new Map(incoming.map(entry => [logKey(entry), entry]));
		for (const entry of retained) {
			const key = logKey(entry);
			if (!merged.has(key)) { merged.set(key, entry); }
		}
		return merged.size === incoming.length
			? incoming
			: [...merged.values()].sort((a, b) => a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0);
	}, [incoming, held, expandedKeys, scope, reversed, jumpVersion]);
	const displayedLogs = useMemo(() => {
		const matching = logs.filter(entry =>
			(node === '*' || (entry.node || '') === node)
			&& (thread === '*' || (entry.thread || '') === thread)
		);
		return reversed ? matching.reverse() : matching;
	}, [logs, node, thread, reversed]);

	const holdPosition = useCallback((userScrolling: boolean) => {
		const current = input.current;
		const view = state.current;
		if (current.loading || view.scope !== current.scope || !view.entries.size) { return; }
		view.following = false;
		view.userScrolling = userScrolling;
		view.expectedTop = null;
		if (containerRef.current) { view.anchor = captureAnchor(containerRef.current); }
		setHeld(previous =>
			previous?.scope === current.scope ? previous : { scope: current.scope, logs: current.incoming }
		);
	}, []);
	const onInspect = useCallback(() => holdPosition(false), [holdPosition]);
	const onScrollIntent = useCallback(() => holdPosition(true), [holdPosition]);
	const onWheel = useCallback((event: WheelEvent<HTMLElement>) => {
		const message = (event.target as HTMLElement).closest<HTMLElement>('[aria-label="Full log message"]');
		if (message && message.scrollHeight > message.clientHeight) {
			holdPosition(false);
			return;
		}
		const element = containerRef.current;
		const towardEdge = input.current.reversed ? event.deltaY > 0 : event.deltaY < 0;
		if (element && towardEdge && atEdge(element, input.current.reversed)) {
			state.current.following = true;
			state.current.userScrolling = true;
			state.current.expectedTop = null;
			setHeld(null);
		} else { holdPosition(true); }
	}, [holdPosition]);
	const onScroll = useCallback(() => {
		const element = containerRef.current;
		if (!element) { return; }
		const view = state.current;
		const edge = atEdge(element, input.current.reversed);
		const user = view.userScrolling || view.expectedTop === null || Math.abs(element.scrollTop - view.expectedTop) > 1;
		if (user) {
			if (edge) {
				view.following = true;
				setHeld(null);
			} else { holdPosition(true); }
		}
		view.anchor = captureAnchor(element);
		view.userScrolling = false;
		view.expectedTop = element.scrollTop;
		setAway(!edge);
	}, [holdPosition]);
	const jumpToLatest = useCallback(() => {
		state.current.following = true;
		state.current.userScrolling = false;
		state.current.anchor = null;
		state.current.jump = true;
		setHeld(null);
		setAway(false);
		setJumpVersion(value => value + 1);
	}, []);

	useLayoutEffect(() => {
		const view = state.current;
		const reset = view.scope !== scope || view.reversed !== reversed;
		const changed = view.displayed !== displayedLogs;
		const expanded = view.expanded !== expandedKeys;
		const collapsing = expanded && expandedKeys.size < (view.expanded?.size ?? 0);
		if (reset) {
			view.following = true;
			view.userScrolling = false;
			view.anchor = null;
			view.initialized = false;
			setHeld(null);
		}
		if (view.base !== logs || reset) { view.entries = new Map(logs.map(entry => [logKey(entry), entry])); }
		view.base = logs;
		view.scope = scope;
		view.reversed = reversed;
		view.displayed = displayedLogs;
		view.expanded = expandedKeys;
		const element = containerRef.current;
		if (!element || loading) { return; }
		if (!reset && !changed && !expanded && view.initialized && !view.jump) { return; }
		if (expanded && expandedKeys.size && !reset) { view.following = false; }
		if (reset || view.following) {
			element.style.paddingBottom = '';
			view.padded = false;
		}
		if (collapsing && !reset && !view.following && !reversed) {
			const top = view.expectedTop ?? element.scrollTop;
			const tableHeight = element.querySelector('table')?.getBoundingClientRect().height ?? 0;
			const padding = Math.max(parseFloat(element.style.paddingBottom) || 0, element.clientHeight + top - tableHeight);
			element.style.paddingBottom = `${padding}px`;
			element.scrollTo({ top, behavior: 'instant' });
		}
		if (expanded && !expandedKeys.size && atEdge(element, reversed)) {
			view.following = true;
			setHeld(null);
		}
		if (!view.following && !reversed && !view.padded) {
			// Preserve existing empty space so short lists can also anchor prepended rows.
			const tableHeight = element.querySelector('table')?.getBoundingClientRect().height ?? 0;
			element.style.paddingBottom = `${Math.max(0, element.clientHeight - tableHeight)}px`;
			view.padded = true;
		}
		if (!view.initialized || reset || view.following || view.jump) {
			element.scrollTo({ top: reversed ? element.scrollHeight : 0, behavior: 'instant' });
		} else if (changed && !expanded && view.anchor) {
			const button = element.querySelector<HTMLButtonElement>(`button[data-log-toggle="${view.anchor.key}"]`);
			if (button) {
				const offset = button.closest('tr')!.getBoundingClientRect().top - element.getBoundingClientRect().top;
				element.scrollTo({ top: element.scrollTop + offset - view.anchor.offset, behavior: 'instant' });
			}
		}
		if (view.jump) {
			const buttons = element.querySelectorAll<HTMLButtonElement>('button[data-log-toggle]');
			const button = buttons[reversed ? buttons.length - 1 : 0];
			const detail = document.getElementById(button?.getAttribute('aria-controls') ?? '');
			(detail?.querySelector<HTMLElement>('[aria-label="Full log message"]') ?? button)?.focus({ preventScroll: true });
		}
		view.jump = false;
		view.initialized = true;
		view.expectedTop = element.scrollTop;
		view.anchor = captureAnchor(element);
		setAway(!atEdge(element, reversed));
	}, [logs, displayedLogs, scope, reversed, expandedKeys, loading, jumpVersion]);

	return { logs, displayedLogs, containerRef, away, onInspect, onScroll, onScrollIntent, onWheel, jumpToLatest };
}
