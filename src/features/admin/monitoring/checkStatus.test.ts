import { checkStatus, STUCK_AFTER_MS } from '@/features/admin/monitoring/checkStatus';
import { describe, expect, it } from 'vitest';

const setAt = '2026-10-20T12:00:00.000Z';
const setMs = Date.parse(setAt);
const after = (ms: number) => new Date(setMs + ms).toISOString();
const before = (ms: number) => new Date(setMs - ms).toISOString();

describe('checkStatus', () => {
	it('is pending until an attempt finishes after the change', () => {
		expect(checkStatus({ setAt, checkProjection: null }, setMs + 1000)).toEqual({
			state: 'pending',
			since: setMs,
			stuck: false,
		});
	});

	it('reports a pending change as stuck once both repair chances have passed', () => {
		expect(checkStatus({ setAt, checkProjection: null }, setMs + STUCK_AFTER_MS)).toMatchObject({
			state: 'pending',
			stuck: true,
		});
	});

	it.each([
		['skipped', { setAt: null, finishedAt: before(1000), errors: [], skipped: 'grafana-sm-disabled' }],
		['errors', { setAt: before(2000), finishedAt: before(1000), errors: [{ target: 'synthetic-check:ins-1' }] }],
		['applied', { setAt: before(2000), finishedAt: before(1000), errors: [] }],
	])('does not report a previous %s outcome against a new change', (_label, checkProjection) => {
		expect(checkStatus({ setAt, checkProjection }, setMs + 1000).state).toBe('pending');
	});

	it('reports a current skipped attempt even though it keeps the old projected setAt', () => {
		expect(
			checkStatus({
				setAt,
				checkProjection: { setAt: before(60_000), finishedAt: after(500), errors: [], skipped: 'local' },
			}),
		).toEqual({ state: 'skipped', gate: 'local', at: setMs + 500 });
	});

	it('reports a current attempt that recorded errors', () => {
		const errors = [{ target: 'synthetic-check:ins-1', error: 'timeout' }];
		expect(checkStatus({ setAt, checkProjection: { setAt, finishedAt: after(500), errors } })).toEqual({
			state: 'errors',
			errors,
			at: setMs + 500,
		});
	});

	it('does not pin errors from an attempt for an older change on the new one', () => {
		const errors = [{ target: 'synthetic-check:ins-1', error: 'timeout' }];
		expect(
			checkStatus({ setAt, checkProjection: { setAt: before(1000), finishedAt: after(500), errors } }, setMs + 600)
				.state,
		).toBe('pending');
	});

	it('is applied when the current attempt projected this change', () => {
		expect(checkStatus({ setAt, checkProjection: { setAt, finishedAt: after(500), errors: [] } })).toEqual({
			state: 'applied',
			at: setMs + 500,
		});
	});

	it('stays pending when an attempt finished after the change but projected an older one', () => {
		expect(
			checkStatus({ setAt, checkProjection: { setAt: before(1000), finishedAt: after(500), errors: [] } }, setMs + 600)
				.state,
		).toBe('pending');
	});
});
