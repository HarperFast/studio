/** @vitest-environment jsdom */
import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useLogInspection } from './useLogInspection';
const entry = (message: string): ReadLogItem => ({
	level: 'info',
	timestamp: '2026-11-19T21:00:00Z',
	node: '',
	thread: 'main/0',
	tags: [],
	message,
});
afterEach(cleanup);
describe('useLogInspection', () => {
	it('pins the exact slice through buffer eviction, reports only retained arrivals, and resumes explicitly', () => {
		const original = [entry('a'), entry('b')];
		const { result, rerender } = renderHook(({ logs, key }) => useLogInspection(logs, key), {
			initialProps: { logs: original, key: 'a' },
		});
		act(() => result.current.pause());
		rerender({ logs: [entry('c'), entry('d')], key: 'a' });
		expect(result.current.logs).toBe(original);
		expect(result.current.pending).toBe(2);
		rerender({ logs: [entry('e'), entry('f')], key: 'a' });
		expect(result.current.logs).toBe(original);
		expect(result.current.pending).toBe(2);
		act(() => result.current.resume());
		expect(result.current.logs.map(log => log.message)).toEqual(['e', 'f']);
		expect(result.current.pending).toBe(0);
	});
	it('releases pinning on query/entity changes and restores a saved slice to its explicit key', () => {
		const original = [entry('a')];
		const { result, rerender } = renderHook(({ logs, key }) => useLogInspection(logs, key), {
			initialProps: { logs: original, key: 'one' },
		});
		act(() => result.current.pause());
		rerender({ logs: [entry('new entity')], key: 'two' });
		expect(result.current.paused).toBe(false);
		act(() => result.current.restore(original, 'three'));
		rerender({ logs: [entry('newer')], key: 'three' });
		expect(result.current.paused).toBe(true);
		expect(result.current.logs).toBe(original);
	});
});
