import { ReplicatedResponse } from '@/integrations/api/replication';
import { parseSSEData, SSEMessage } from '@/integrations/api/sse/parseSSEStream';
import { ResolveInstanceConnectionParams } from '@/integrations/api/sse/resolveInstanceConnection';
import { streamOperation } from '@/integrations/api/sse/streamOperation';
import { DeployCertification } from './deployOutcome';
import { RolloutSnapshot } from './restartJob';

/** Lifecycle phases Harper's `deploy_component` emits, in order. */
export const DEPLOY_PHASE_ORDER = ['prepare', 'load', 'replicate', 'restart', 'success'] as const;
export const STAGE_PHASE_ORDER = ['prepare', 'load', 'replicate', 'staged'] as const;

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

/** Something the deploy wants a person to know without failing, e.g. a peer that installed different code (5.3.1+). */
interface DeployWarningEvent {
	message?: string;
}

/**
 * A live deploy event, discriminated by `type`, surfaced to the UI via `onEvent`. `rollout` is Studio's
 * own: how the other nodes are taking the release, read from the restart job after the deploy answered.
 */
export type DeployStreamEvent =
	| { type: 'phase'; data: DeployPhaseEvent }
	| { type: 'install'; data: DeployInstallEvent }
	| { type: 'peer'; data: DeployPeerEvent }
	| { type: 'warning'; data: DeployWarningEvent }
	| { type: 'rollout'; data: RolloutSnapshot };

export interface DeployComponentResult extends ReplicatedResponse {
	deployment_id?: string;
	phase?: string;
	certification?: DeployCertification;
	staged?: boolean;
	/** The `restart_service` job a rolling restart hands the other nodes to. */
	restartJobId?: string;
	/** The `warning` events the deploy streamed. */
	warnings?: string[];
	/** How the other nodes took the release, once Studio followed `restartJobId`. */
	rollout?: RolloutSnapshot;
}

export function toDeployStreamEvent(message: SSEMessage): DeployStreamEvent | undefined {
	switch (message.event) {
		case 'phase':
			return { type: 'phase', data: parseSSEData(message) as DeployPhaseEvent };
		case 'install':
			return { type: 'install', data: parseSSEData(message) as DeployInstallEvent };
		case 'peer':
			return { type: 'peer', data: parseSSEData(message) as DeployPeerEvent };
		case 'warning': {
			const data = parseSSEData(message);
			return {
				type: 'warning',
				data: typeof data === 'string' ? { message: data } : (data as DeployWarningEvent | undefined) ?? {},
			};
		}
	}
	return undefined;
}

export interface DeployComponentStreamParams {
	connection: ResolveInstanceConnectionParams;
	body: Record<string, unknown>;
	signal?: AbortSignal;
	/** Called for each live deploy event so the UI can render progress. */
	onEvent?: (event: DeployStreamEvent) => void;
}

/**
 * Run `deploy_component` over SSE, forwarding live phase/install/peer/warning events to `onEvent`
 * and resolving with the terminal `done` result.
 *
 * Throws the transport errors from `@/integrations/api/sse/errors`:
 * - `SSEUnsupportedError` — the server/proxy didn't stream; caller should retry buffered.
 * - `SSEOperationError` — the deploy failed (terminal `error` event).
 * - `SSEInconclusiveError` — the stream ended without a verdict; caller must poll.
 */
export async function deployComponentStream({
	connection,
	body,
	signal,
	onEvent,
}: DeployComponentStreamParams): Promise<DeployComponentResult> {
	const warnings: string[] = [];
	const result = await streamOperation({
		connection,
		body,
		signal,
		onMessage: (message) => {
			const event = toDeployStreamEvent(message);
			if (!event) {
				return;
			}
			if (event.type === 'warning' && typeof event.data.message === 'string' && event.data.message) {
				warnings.push(event.data.message);
			}
			onEvent?.(event);
		},
	});

	const deployed = (result ?? {}) as DeployComponentResult;
	return warnings.length ? { ...deployed, warnings } : deployed;
}
