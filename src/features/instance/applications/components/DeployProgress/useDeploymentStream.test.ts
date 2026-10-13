/** @vitest-environment jsdom */
import { SSEOperationError } from '@/integrations/api/sse/errors';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDeploymentStream } from './useDeploymentStream';

describe('useDeploymentStream', () => {
	it('keeps streamed warnings and the latest rollout snapshot', () => {
		const { result } = renderHook(() => useDeploymentStream());
		act(() => {
			result.current.markStarted();
			result.current.onEvent({ type: 'warning', data: { message: 'node-b installed npm:web@1.5.0' } });
			result.current.onEvent({ type: 'warning', data: {} });
			result.current.onEvent({ type: 'rollout', data: { jobId: 'j', state: 'following', nodes: [] } });
			result.current.onEvent({ type: 'rollout', data: { jobId: 'j', state: 'complete', nodes: [] } });
		});
		expect(result.current.state.warnings).toEqual(['node-b installed npm:web@1.5.0']);
		expect(result.current.state.rollout?.state).toBe('complete');
	});

	it("takes the receiving node's certification and the record id from a deploy that answered", () => {
		const { result } = renderHook(() => useDeploymentStream());
		act(() => {
			result.current.markStarted();
			result.current.markSettled('success', undefined, {
				result: { message: 'ok', deployment_id: 'd1', certification: 'certified' },
			});
		});
		expect(result.current.state).toMatchObject({
			lifecycle: 'success',
			certification: 'certified',
			deploymentId: 'd1',
		});
	});

	it("takes the canary's decision and the record id from a deploy it rejected", () => {
		const { result } = renderHook(() => useDeploymentStream());
		const failure = new SSEOperationError('web was not deployed: …', {
			deploymentId: 'd1',
			certification: { status: 'rejected', reason: 'boom', restored: 'd0', failed_closed: false },
		});
		act(() => {
			result.current.markStarted();
			result.current.markSettled('error', failure.message, { failure });
		});
		expect(result.current.state).toMatchObject({
			lifecycle: 'error',
			error: 'web was not deployed: …',
			deploymentId: 'd1',
			decision: { status: 'rejected', reason: 'boom', restored: 'd0', failedClosed: false },
		});
	});

	it('keeps the warnings a result carries when none streamed, without repeating streamed ones', () => {
		const { result } = renderHook(() => useDeploymentStream());
		act(() => {
			result.current.markStarted();
			result.current.markSettled('success', undefined, { result: { message: 'ok', warnings: ['drift'] } });
		});
		expect(result.current.state.warnings).toEqual(['drift']);

		act(() => {
			result.current.markStarted();
			result.current.onEvent({ type: 'warning', data: { message: 'drift' } });
			result.current.markSettled('success', undefined, { result: { message: 'ok', warnings: ['drift'] } });
		});
		expect(result.current.state.warnings).toEqual(['drift']);
	});

	it('starts each deploy clean', () => {
		const { result } = renderHook(() => useDeploymentStream());
		act(() => {
			result.current.onEvent({ type: 'warning', data: { message: 'old' } });
			result.current.markSettled('success', undefined, { result: { message: 'ok', deployment_id: 'd1' } });
			result.current.markStarted();
		});
		expect(result.current.state.warnings).toBeUndefined();
		expect(result.current.state.deploymentId).toBeUndefined();
	});
});
