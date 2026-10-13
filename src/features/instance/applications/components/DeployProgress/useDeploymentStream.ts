import {
	DeployComponentResult,
	DeployPeerEvent,
	DeployStreamEvent,
} from '@/integrations/api/instance/applications/deployComponentStream';
import {
	CertificationDecision,
	DeployCertification,
	deployFailureDetails,
} from '@/integrations/api/instance/applications/deployOutcome';
import { RolloutSnapshot } from '@/integrations/api/instance/applications/restartJob';
import { useCallback, useMemo, useReducer } from 'react';

export type DeploymentLifecycle = 'idle' | 'streaming' | 'success' | 'error' | 'inconclusive';
export type PhaseStatus = 'start' | 'done' | 'error';

export interface InstallLine {
	/** Stable, monotonically increasing id so React keys survive front-slicing of the log. */
	id: number;
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
	warnings?: string[];
	rollout?: RolloutSnapshot;
	/** How the node that received the deploy checked the release, once it answered. */
	certification?: DeployCertification;
	/** Why that node's canary refused the release. */
	decision?: CertificationDecision;
	deploymentId?: string;
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

type Settled = Extract<DeploymentLifecycle, 'success' | 'error' | 'inconclusive'>;

type Action =
	| { kind: 'reset' }
	| { kind: 'start' }
	| { kind: 'event'; event: DeployStreamEvent }
	| { kind: 'settled'; lifecycle: Settled; error?: string; outcome?: SettledOutcome };

interface SettledOutcome {
	result?: DeployComponentResult;
	failure?: unknown;
}

function settledDetails(
	state: DeploymentStreamState,
	outcome: SettledOutcome | undefined,
): Partial<DeploymentStreamState> {
	if (outcome?.result) {
		const { certification, deployment_id, rollout, warnings } = outcome.result;
		return {
			certification: typeof certification === 'string' ? certification : undefined,
			deploymentId: deployment_id,
			...(rollout ? { rollout } : {}),
			// The streamed events already put them here; a result that did not stream still carries them.
			...(!state.warnings?.length && warnings?.length ? { warnings } : {}),
		};
	}
	if (outcome?.failure !== undefined) {
		const { deploymentId, certification } = deployFailureDetails(outcome.failure);
		return { deploymentId, decision: certification };
	}
	return {};
}

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
				// Derive the next id from the last line's so keys stay stable across slicing.
				const nextId = (state.installLog[state.installLog.length - 1]?.id ?? 0) + 1;
				const next = state.installLog.concat({ id: nextId, stream: event.data.stream, line: event.data.line });
				return {
					...state,
					installLog: next.length > MAX_INSTALL_LINES ? next.slice(-MAX_INSTALL_LINES) : next,
				};
			}
			if (event.type === 'warning') {
				const { message } = event.data;
				return typeof message === 'string' && message
					? { ...state, warnings: (state.warnings ?? []).concat(message) }
					: state;
			}
			if (event.type === 'rollout') {
				return { ...state, rollout: event.data };
			}
			// peer
			return { ...state, peers: state.peers.concat(event.data) };
		}
		case 'settled':
			return { ...state, ...settledDetails(state, action.outcome), lifecycle: action.lifecycle, error: action.error };
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
		(lifecycle: Settled, error?: string, outcome?: SettledOutcome) =>
			dispatch({ kind: 'settled', lifecycle, error, outcome }),
		[],
	);

	return useMemo(
		() => ({ state, onEvent, markStarted, markSettled, reset }),
		[state, onEvent, markStarted, markSettled, reset],
	);
}
