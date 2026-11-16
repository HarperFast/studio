import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { SecretsPublicKey } from '@/integrations/api/instance/secrets/secrets';
import { rejectReplicationFailures, ReplicatedResponse } from '@/integrations/api/replication';
import {
	openSealedResponse,
	SealableOperation,
	SealedMode,
	SealedResult,
	sealOperation,
} from '@/lib/crypto/sealedOperation';
import { isAxiosError } from 'axios';

/** The sealed operation ran and answered a failure. */
export class SealedOperationError extends Error {
	operation: string;
	status: number;
	body: unknown;
	executed?: true;

	constructor(operation: string, { status, body, executed }: SealedResult) {
		const detail = (body as { error?: unknown } | null | undefined)?.error;
		super(typeof detail === 'string' ? detail : `${operation} failed with status ${status}`);
		this.name = 'SealedOperationError';
		this.operation = operation;
		this.status = status;
		this.body = body;
		this.executed = executed;
	}
}

/** The request went out, but the answer was missing, malformed or not this request's: the operation may have run. */
export class UnreadableSealedAnswerError extends Error {
	operation: string;

	constructor(operation: string, cause: unknown) {
		super(`The cluster's answer to ${operation} could not be read.`, { cause });
		this.name = 'UnreadableSealedAnswerError';
		this.operation = operation;
	}
}

export function isSealedRefusal(error: unknown, status: number, message: string): boolean {
	return error instanceof SealedOperationError && error.status === status && error.message === message;
}

interface RunSealedOperationParams extends InstanceClientConfig {
	op: SealableOperation;
	key: SecretsPublicKey;
	/** Fetches the key again when the node reports another fingerprint; asked once per call. */
	refreshKey?: () => Promise<SecretsPublicKey>;
	/** Attribution for the node's log. */
	actor?: string;
	mode?: SealedMode;
	visibleFields?: readonly string[];
}

// The node accepts a timestamp only within its window around its own clock. A refusal names that clock, and the
// difference serves every later request to the same address, so a skewed browser pays the round trip once per node.
const clockOffsetsMs = new Map<string, number>();

export function _resetClockOffsetsForTests(): void {
	clockOffsetsMs.clear();
}

/**
 * Sends `op` sealed as `encrypted_operation` through `instanceClient` and opens the answer. A plaintext refusal is
 * retried once when it is one the client can repair: a timestamp outside the node's window (400 with `server_time`)
 * or an envelope sealed to another key (409 with `custody_fingerprint`). Everything else is thrown as the request's
 * own failure; a sealed answer with a failing status, whatever HTTP status carried it, as a `SealedOperationError`;
 * and a replicated write some peer refused as the direct path refuses it.
 */
export async function runSealedOperation(
	{ instanceClient, op, key, refreshKey, actor, mode, visibleFields }: RunSealedOperationParams,
): Promise<SealedResult> {
	const node = instanceClient.defaults.baseURL ?? '';
	let currentKey = key;
	let clockRetried = false;
	let keyRetried = false;
	for (;;) {
		const { request, responseKey, nonce } = await sealOperation({
			op,
			publicKey: currentKey.publicKey,
			kid: currentKey.fingerprint,
			actor,
			now: Date.now() + (clockOffsetsMs.get(node) ?? 0),
			mode,
			visibleFields,
		});
		let data: unknown;
		try {
			({ data } = await instanceClient.post('/', request));
		} catch (error) {
			const refusal = isAxiosError(error) ? error.response : undefined;
			const detail = refusal?.data as
				| { server_time?: unknown; custody_fingerprint?: unknown; encrypted_response?: unknown }
				| undefined;
			if (refusal?.status === 400 && typeof detail?.server_time === 'number') {
				if (clockRetried) {
					clockOffsetsMs.delete(node);
					throw error;
				}
				clockOffsetsMs.set(node, detail.server_time - Date.now());
				clockRetried = true;
				continue;
			}
			if (refusal?.status === 409 && typeof detail?.custody_fingerprint === 'string' && refreshKey && !keyRetried) {
				currentKey = await refreshKey();
				keyRetried = true;
				continue;
			}
			if (!detail?.encrypted_response) {
				throw error;
			}
			data = detail;
		}
		const payload = (data as { encrypted_response?: unknown } | null | undefined)?.encrypted_response;
		if (!payload) {
			throw new UnreadableSealedAnswerError(op.operation, new Error('The answer was not sealed.'));
		}
		let result: SealedResult;
		try {
			result = await openSealedResponse(payload, responseKey, nonce);
		} catch (error) {
			throw new UnreadableSealedAnswerError(op.operation, error);
		}
		if (result.status >= 400) {
			throw new SealedOperationError(op.operation, result);
		}
		if (result.body && typeof result.body === 'object') {
			await rejectReplicationFailures({ data: result.body as ReplicatedResponse });
		}
		return result;
	}
}
