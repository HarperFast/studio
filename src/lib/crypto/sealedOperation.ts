/**
 * The client side of Harper's `encrypted_operation` (5.4.0+), in Web Crypto. The operation rides inside an
 * `enc:v1:` envelope sealed to the node's secrets key, and the node's answer comes back AES-256-GCM under a key only
 * this client chose, so a relay sees ciphertext both ways. The wire format is harper's `utility/sealedOperation.ts`;
 * `__tests__/harper-v5.4.0/` keeps that reference unchanged, and the tests open with it what this seals.
 *
 * Two modes, as the node offers them. `sealed` puts the whole operation inside the envelope. `fields` sends the operation
 * as JSON text a relay can read, with chosen values replaced by sealed leaves, and binds that text to the envelope by
 * its hash (`oph`), so a relay can record what ran but can neither read nor alter the sealed values.
 */
import { ab, encryptEnvelope, fromBase64, requireSubtle, toBase64 } from './envSecret';

export const SEALED_OPERATION_VERSION = 1;
const RESPONSE_KEY_BYTES = 32;
const NONCE_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const RESPONSE_AAD_PREFIX = 'harper.encrypted_operation.response:';
const FIELD_AAD_PREFIX = 'harper.encrypted_operation.field:';
const SEALED_LEAF_KEY = '$sealed';
const DEFAULT_VISIBLE_FIELDS: readonly string[] = ['database', 'schema', 'table'];

export type SealableOperation = Record<string, unknown> & { operation: string };

export type SealedMode = 'sealed' | 'fields';

type SealedOperationRequest =
	| { operation: 'encrypted_operation'; envelope: string }
	| { operation: 'encrypted_operation'; mode: 'fields'; op: string; envelope: string };

interface SealedOperation {
	request: SealedOperationRequest;
	/** The key the node seals its answer, and any sealed leaf, with. */
	responseKey: Uint8Array;
	nonce: string;
}

export interface SealedResult {
	status: number;
	body: unknown;
	/** The operation ran but its result could not be returned; do not resend one that is not idempotent. */
	executed?: true;
}

interface SealOperationOptions {
	op: SealableOperation;
	publicKey: string;
	/** The key's fingerprint, as the server reports it; the node refuses an envelope whose `kid` is not its own. */
	kid: string;
	actor?: string;
	/** The client's clock in milliseconds; the node accepts it only within its window. */
	now?: number;
	mode?: SealedMode;
	/** Fields mode: the top-level keys left readable besides `operation`; every other top-level value is sealed. */
	visibleFields?: readonly string[];
}

export async function sealOperation(
	{ op, publicKey, kid, actor, now = Date.now(), mode = 'sealed', visibleFields = DEFAULT_VISIBLE_FIELDS }:
		SealOperationOptions,
): Promise<SealedOperation> {
	const responseKey = crypto.getRandomValues(new Uint8Array(RESPONSE_KEY_BYTES));
	const nonce = toBase64(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)));
	const header: Record<string, unknown> = {
		v: SEALED_OPERATION_VERSION,
		rk: toBase64(responseKey),
		nonce,
		ts: now,
		...(actor === undefined ? {} : { actor }),
	};
	if (mode === 'sealed') {
		header.op = op;
		const envelope = await encryptEnvelope(JSON.stringify(header), publicKey, kid);
		return { request: { operation: 'encrypted_operation', envelope }, responseKey, nonce };
	}
	const leafKey = await requireSubtle().importKey('raw', ab(responseKey), { name: 'AES-GCM' }, false, ['encrypt']);
	const visible: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(op)) {
		visible[key] = key === 'operation' || visibleFields.includes(key)
			? value
			: await sealValue(value, leafKey, nonce, '/' + pointerToken(key));
	}
	const opText = JSON.stringify(visible);
	header.oph = await hashOperationText(opText);
	const envelope = await encryptEnvelope(JSON.stringify(header), publicKey, kid);
	return { request: { operation: 'encrypted_operation', mode: 'fields', op: opText, envelope }, responseKey, nonce };
}

function pointerToken(key: string): string {
	return key.replaceAll('~', '~0').replaceAll('/', '~1');
}

async function hashOperationText(text: string): Promise<string> {
	return toBase64(new Uint8Array(await requireSubtle().digest('SHA-256', ab(new TextEncoder().encode(text)))));
}

/** One sealed leaf: the value's JSON text under the response key, bound to its location by the additional data. */
async function sealValue(
	value: unknown,
	key: CryptoKey,
	nonce: string,
	pointer: string,
): Promise<{ [SEALED_LEAF_KEY]: string }> {
	const json = JSON.stringify(value);
	if (json === undefined) {
		throw new TypeError(`The value at '${pointer}' has no JSON representation.`);
	}
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	// Web Crypto appends the tag to the ciphertext, which is the leaf's iv, ciphertext, tag order once iv leads.
	const sealed = new Uint8Array(
		await requireSubtle().encrypt(
			{
				name: 'AES-GCM',
				iv: ab(iv),
				additionalData: ab(new TextEncoder().encode(`${FIELD_AAD_PREFIX}${nonce}:${pointer}`)),
				tagLength: 128,
			},
			key,
			ab(new TextEncoder().encode(json)),
		),
	);
	const leaf = new Uint8Array(iv.length + sealed.length);
	leaf.set(iv);
	leaf.set(sealed, iv.length);
	return { [SEALED_LEAF_KEY]: toBase64(leaf) };
}

/**
 * Opens the node's `encrypted_response` with the request's own key and nonce. Throws on a payload that is not the
 * node's answer to this request: a wrong version or shape, a tampered or moved payload, or another request's nonce.
 */
export async function openSealedResponse(
	payload: unknown,
	responseKey: Uint8Array,
	nonce: string,
): Promise<SealedResult> {
	const sealed = payload as { v?: unknown; iv?: unknown; ct?: unknown; tag?: unknown } | null | undefined;
	const iv = fromBase64(sealed?.iv, IV_BYTES);
	const ct = fromBase64(sealed?.ct);
	const tag = fromBase64(sealed?.tag, TAG_BYTES);
	if (sealed?.v !== SEALED_OPERATION_VERSION || !iv || !ct || !tag) {
		throw new Error('The cluster answered with a malformed sealed response.');
	}
	const subtle = requireSubtle();
	const key = await subtle.importKey('raw', ab(responseKey), { name: 'AES-GCM' }, false, ['decrypt']);
	const sealedBytes = new Uint8Array(ct.length + tag.length);
	sealedBytes.set(ct);
	sealedBytes.set(tag, ct.length);
	let plaintext: ArrayBuffer;
	try {
		plaintext = await subtle.decrypt(
			{
				name: 'AES-GCM',
				iv: ab(iv),
				additionalData: ab(new TextEncoder().encode(RESPONSE_AAD_PREFIX + nonce)),
				tagLength: 128,
			},
			key,
			ab(sealedBytes),
		);
	} catch {
		throw new Error('The sealed response did not authenticate as the answer to this request.');
	}
	let result: unknown;
	try {
		result = JSON.parse(new TextDecoder().decode(plaintext));
	} catch {
		throw new Error('The cluster answered with a malformed sealed response.');
	}
	if (!result || typeof result !== 'object' || !Number.isInteger((result as { status?: unknown }).status)) {
		throw new Error('The cluster answered with a malformed sealed response.');
	}
	return result as SealedResult;
}
