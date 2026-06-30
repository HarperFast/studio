import { ReplicatedResponse } from '@/integrations/api/replication';
import { parseSSEData } from '@/integrations/api/sse/parseSSEStream';
import { ResolveInstanceConnectionParams } from '@/integrations/api/sse/resolveInstanceConnection';
import { streamOperation } from '@/integrations/api/sse/streamOperation';

/** Lifecycle phases Harper's `deploy_component` emits, in order. */
export const DEPLOY_PHASE_ORDER = ['prepare', 'load', 'replicate', 'restart', 'success'] as const;
export type DeployPhase = (typeof DEPLOY_PHASE_ORDER)[number];

export interface DeployPhaseEvent {
	phase: string;
	status: 'start' | 'done' | 'error';
	message?: string;
	rolling?: boolean;
}

export interface DeployInstallEvent {
	manager?: string;
	/** 'stdout' | 'stderr' */
	stream?: string;
	line: string;
}

/** Per-node replication result emitted as the origin fans the deploy out to peers. */
export interface DeployPeerEvent {
	node?: string;
	status?: string;
	reason?: string;
	[key: string]: unknown;
}

/** A live deploy event, discriminated by `type`, surfaced to the UI via `onEvent`. */
export type DeployStreamEvent =
	| { type: 'phase'; data: DeployPhaseEvent }
	| { type: 'install'; data: DeployInstallEvent }
	| { type: 'peer'; data: DeployPeerEvent };

export interface DeployComponentResult extends ReplicatedResponse {
	deployment_id?: string;
	phase?: string;
}

export interface DeployComponentStreamParams {
	connection: ResolveInstanceConnectionParams;
	package: string;
	project: string;
	replicated: boolean;
	install_command?: string;
	restart?: string;
	signal?: AbortSignal;
	/** Called for each live deploy event so the UI can render progress. */
	onEvent?: (event: DeployStreamEvent) => void;
}

/**
 * Run `deploy_component` over SSE, forwarding live phase/install/peer events to `onEvent`
 * and resolving with the terminal `done` result.
 *
 * Throws the transport errors from `@/integrations/api/sse/errors`:
 * - `SSEUnsupportedError` — the server/proxy didn't stream; caller should retry buffered.
 * - `SSEOperationError` — the deploy failed (terminal `error` event).
 * - `SSEInconclusiveError` — the stream ended without a verdict; caller must poll.
 */
export async function deployComponentStream({
	connection,
	package: packageRef,
	project,
	replicated,
	install_command,
	restart,
	signal,
	onEvent,
}: DeployComponentStreamParams): Promise<DeployComponentResult> {
	const result = await streamOperation({
		connection,
		body: {
			operation: 'deploy_component',
			package: packageRef,
			project,
			replicated,
			install_command: install_command || undefined,
			restart,
		},
		signal,
		onMessage: (message) => {
			if (!onEvent) {
				return;
			}
			switch (message.event) {
				case 'phase':
					onEvent({ type: 'phase', data: parseSSEData(message) as DeployPhaseEvent });
					break;
				case 'install':
					onEvent({ type: 'install', data: parseSSEData(message) as DeployInstallEvent });
					break;
				case 'peer':
					onEvent({ type: 'peer', data: parseSSEData(message) as DeployPeerEvent });
					break;
			}
		},
	});

	return (result ?? {}) as DeployComponentResult;
}
