import { DeployPeerEvent, DeployStreamEvent } from '@/integrations/api/instance/applications/deployComponentStream';
import { useCallback, useMemo, useReducer } from 'react';

export type DeploymentLifecycle = 'idle' | 'streaming' | 'success' | 'error' | 'inconclusive';
export type PhaseStatus = 'start' | 'done' | 'error';

export interface InstallLine {
	stream?: string;
	line: string;
}

export interface DeploymentStreamState {
	lifecycle: DeploymentLifecycle;
	/** Latest status seen per phase, e.g. `{ prepare: 'done', load: 'start' }`. */
	phases: Record<string, PhaseStatus>;
	currentPhase?: string;
	installLog: InstallLine[];
	peers: DeployPeerEvent[];
	error?: string;
}

const INITIAL_STATE: DeploymentStreamState = {
	lifecycle: 'idle',
	phases: {},
	installLog: [],
	peers: [],
};

// Keep the rendered install log bounded so a very chatty install can't grow state without
// limit; the server already aggregates, this is a UI safety net.
const MAX_INSTALL_LINES = 1000;

type Action =
	| { kind: 'reset' }
	| { kind: 'start' }
	| { kind: 'event'; event: DeployStreamEvent }
	| { kind: 'settled'; lifecycle: Extract<DeploymentLifecycle, 'success' | 'error' | 'inconclusive'>; error?: string };

function reducer(state: DeploymentStreamState, action: Action): DeploymentStreamState {
	switch (action.kind) {
		case 'reset':
			return INITIAL_STATE;
		case 'start':
			return { ...INITIAL_STATE, lifecycle: 'streaming' };
		case 'event': {
			const { event } = action;
			if (event.type === 'phase') {
				const { phase, status } = event.data;
				return {
					...state,
					lifecycle: 'streaming',
					phases: { ...state.phases, [phase]: status },
					currentPhase: status === 'start' ? phase : state.currentPhase,
				};
			}
			if (event.type === 'install') {
				const next = state.installLog.concat({ stream: event.data.stream, line: event.data.line });
				return {
					...state,
					installLog: next.length > MAX_INSTALL_LINES ? next.slice(-MAX_INSTALL_LINES) : next,
				};
			}
			// peer
			return { ...state, peers: state.peers.concat(event.data) };
		}
		case 'settled':
			return { ...state, lifecycle: action.lifecycle, error: action.error };
	}
}

/**
 * Accumulate live `deploy_component` SSE events into render-ready state.
 *
 * Returns `onEvent` to pass into the deploy mutation, plus `markStarted`/`markSettled`
 * to bracket the lifecycle from the mutation's callbacks. A stream is a sequence of
 * side-effects, not cacheable data, so this is component state (a reducer) rather than a
 * React Query cache entry — the mutation still owns initiation and toast ergonomics.
 */
export function useDeploymentStream() {
	const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

	const onEvent = useCallback((event: DeployStreamEvent) => dispatch({ kind: 'event', event }), []);
	const markStarted = useCallback(() => dispatch({ kind: 'start' }), []);
	const reset = useCallback(() => dispatch({ kind: 'reset' }), []);
	const markSettled = useCallback(
		(lifecycle: 'success' | 'error' | 'inconclusive', error?: string) =>
			dispatch({ kind: 'settled', lifecycle, error }),
		[],
	);

	return useMemo(
		() => ({ state, onEvent, markStarted, markSettled, reset }),
		[state, onEvent, markStarted, markSettled, reset],
	);
}
