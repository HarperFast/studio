import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';

export interface StreamState {
	entries: ReadLogItem[];
	/** The tail ended or errored; the query takes over polling until inputs change. */
	fellBack: boolean;
}

export type StreamAction =
	| { kind: 'reset' }
	| { kind: 'retry' }
	| { kind: 'append'; entries: ReadLogItem[]; cap: number }
	| { kind: 'fellBack' };

export const INITIAL_STREAM_STATE: StreamState = { entries: [], fellBack: false };

/**
 * Accumulator for the live SSE tail, driven by the hook via `useReducer`. Kept as a pure
 * module (no React/auth imports) so it unit-tests in the node env without a DOM.
 */
export function streamReducer(state: StreamState, action: StreamAction): StreamState {
	switch (action.kind) {
		case 'reset':
			return INITIAL_STREAM_STATE;
		case 'retry':
			// Re-attempt SSE (e.g. Live toggled back on) without discarding entries already shown.
			return state.fellBack ? { ...state, fellBack: false } : state;
		case 'append': {
			if (action.entries.length === 0) {
				return state;
			}
			const next = state.entries.concat(action.entries);
			if (next.length <= action.cap) {
				return { ...state, entries: next };
			}
			// Keep the newest `cap` entries by timestamp.
			next.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
			return { ...state, entries: next.slice(0, action.cap) };
		}
		case 'fellBack':
			return { ...state, fellBack: true };
	}
}
