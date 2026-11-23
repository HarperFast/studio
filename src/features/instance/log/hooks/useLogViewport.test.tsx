/** @vitest-environment jsdom */
import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { logKey } from './mergeReadLogs';
import { useLogViewport } from './useLogViewport';
const entry = (message: string): ReadLogItem => ({
	level: 'info',
	timestamp: '2026-11-20T12:00:00Z',
	node: '',
	thread: 'main/0',
	tags: [],
	message,
});
const defaults = {
	queryKey: 'one',
	expandedKeys: new Set<string>(),
	reversed: false,
	node: '*',
	thread: '*',
	loading: false,
};
afterEach(cleanup);
it('keeps arrivals visible while retaining the original reading context in a bounded buffer', () => {
	const original = [entry('a'), entry('b')];
	const { result, rerender } = renderHook(({ incoming }) => useLogViewport({ ...defaults, incoming }), {
		initialProps: { incoming: original },
	});
	act(() => result.current.onInspect());
	rerender({ incoming: [entry('c'), entry('d')] });
	expect(result.current.logs.map(log => log.message)).toEqual(['c', 'd', 'a', 'b']);
	expect(result.current.logs.find(log => log.message === 'a')).toBe(original[0]);
	rerender({ incoming: [entry('e'), entry('f')] });
	expect(result.current.logs.map(log => log.message)).toEqual(['e', 'f', 'a', 'b']);
	act(() => result.current.jumpToLatest());
	expect(result.current.logs.map(log => log.message)).toEqual(['e', 'f']);
});
it('keeps expanded records through buffer eviction and Jump until they are closed', () => {
	const original = entry('expanded');
	const latest = entry('latest');
	const { result, rerender } = renderHook(props => useLogViewport({ ...defaults, ...props }), {
		initialProps: { incoming: [original], expandedKeys: new Set([logKey(original)]) },
	});
	act(() => result.current.onInspect());
	rerender({ incoming: [latest], expandedKeys: new Set([logKey(original)]) });
	act(() => result.current.jumpToLatest());
	expect(result.current.logs).toContain(original);
	expect(result.current.logs).toContain(latest);
	rerender({ incoming: [latest], expandedKeys: new Set() });
	expect(result.current.logs).toEqual([latest]);
});
it('releases retained data on query and facet changes', () => {
	const original = entry('old');
	const other = { ...entry('other'), node: 'node-b' };
	const { result, rerender } = renderHook(props => useLogViewport({ ...defaults, ...props }), {
		initialProps: { incoming: [original], queryKey: 'one', node: '*' },
	});
	act(() => result.current.onInspect());
	rerender({ incoming: [other], queryKey: 'two', node: '*' });
	expect(result.current.logs).toEqual([other]);
	act(() => result.current.onInspect());
	rerender({ incoming: [entry('new')], queryKey: 'two', node: 'node-a' });
	expect(result.current.logs).toHaveLength(1);
	expect(result.current.displayedLogs).toHaveLength(0);
});
it('continues receiving results after an inspection gesture during loading or an empty view', () => {
	const { result, rerender } = renderHook(props => useLogViewport({ ...defaults, ...props }), {
		initialProps: { incoming: [] as ReadLogItem[], loading: true },
	});
	act(() => result.current.onInspect());
	rerender({ incoming: [entry('loaded')], loading: false });
	expect(result.current.logs.map(log => log.message)).toEqual(['loaded']);
});
