import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { SecretsPublicKey } from '@/integrations/api/instance/secrets/secrets';
import { openSealedResponse, SealableOperation, SealedResult, sealOperation } from '@/lib/crypto/sealedOperation';
import { isAxiosError } from 'axios';

/** The sealed operation ran and answered a failure; `status` and `body` are the operation's own. */
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

export function isSealedRefusal(error: unknown, status: number, message: string): boolean {
	return error instanceof SealedOperationError && error.status === status && error.message === message;
}

export interface RunSealedOperationParams extends InstanceClientConfig {
	op: SealableOperation;
	key: SecretsPublicKey;
	/** Fetches the key again when the node reports another fingerprint; asked once per call. */
	refreshKey?: () => Promise<SecretsPublicKey>;
	actor?: string;
}

// The node accepts a timestamp only within its window around its own clock. A refusal names that clock, and the
// difference serves every later request, so a skewed browser pays the round trip once.
let clockOffsetMs = 0;

export function _resetClockOffsetForTests(): void {
	clockOffsetMs = 0;
}

/**
 * Sends `op` sealed as `encrypted_operation` through `instanceClient` and opens the answer. A plaintext refusal is
 * retried once when it is one the client can repair: a timestamp outside the node's window (400 with `server_time`)
 * or an envelope sealed to another key (409 with `custody_fingerprint`). Everything else is thrown as the request's
 * own failure, and a sealed answer with a failing status as a `SealedOperationError`.
 */
export async function runSealedOperation(
	{ instanceClient, op, key, refreshKey, actor }: RunSealedOperationParams,
): Promise<SealedResult> {
	let currentKey = key;
	let clockRetried = false;
	let keyRetried = false;
	for (;;) {
		const { request, responseKey, nonce } = await sealOperation({
			op,
			publicKey: currentKey.publicKey,
			kid: currentKey.fingerprint,
			actor,
			now: Date.now() + clockOffsetMs,
		});
		let data: unknown;
		try {
			({ data } = await instanceClient.post('/', request));
		} catch (error) {
			const refusal = isAxiosError(error) ? error.response : undefined;
			const detail = refusal?.data as { server_time?: unknown; custody_fingerprint?: unknown } | undefined;
			if (refusal?.status === 400 && typeof detail?.server_time === 'number' && !clockRetried) {
				clockOffsetMs = detail.server_time - Date.now();
				clockRetried = true;
				continue;
			}
			if (refusal?.status === 409 && typeof detail?.custody_fingerprint === 'string' && refreshKey && !keyRetried) {
				currentKey = await refreshKey();
				keyRetried = true;
				continue;
			}
			throw error;
		}
		const payload = (data as { encrypted_response?: unknown } | null | undefined)?.encrypted_response;
		if (!payload) {
			throw new Error(`The cluster did not answer ${op.operation} with a sealed response.`);
		}
		const result = await openSealedResponse(payload, responseKey, nonce);
		if (result.status >= 400) {
			throw new SealedOperationError(op.operation, result);
		}
		return result;
	}
}
