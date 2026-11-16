// @vitest-environment node
// Node env: Web Crypto (globalThis.crypto.subtle, used by the helper) and node:crypto (used by Harper's reference) are
// both available. The reference under __tests__/harper-v5.4.0/ is the node's own client, copied unchanged from
// HarperFast/harper at v5.4.0, so what this opens is what the node accepts and what it answers.
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	NONCE_BYTES,
	openResponse,
	RESPONSE_KEY_BYTES,
	sealOperation as referenceSealOperation,
	sealResponse,
} from './__tests__/harper-v5.4.0/sealedOperation.ts';
import { decryptEnvelope, fingerprintOf, parseEnvelopeFields } from './__tests__/harper-v5.4.0/secretEnvelope.ts';
import { ENV_ENCRYPTED_PREFIX } from './envSecret';
import { openSealedResponse, SEALED_OPERATION_VERSION, sealOperation } from './sealedOperation';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
	modulusLength: 2048,
	publicKeyEncoding: { type: 'spki', format: 'pem' },
	privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const publicKeyPem = publicKey as unknown as string;
const privateKeyPem = privateKey as unknown as string;
const kid = fingerprintOf(publicKeyPem);

const op = {
	operation: 'add_user',
	username: 'owner@example.com',
	password: 'p@ss "word"',
	role: 'super_user',
	active: true,
};

/** Opens a request the way the node does (`components/encryptedOperation.ts`'s `openHeader`). */
function openHeader(envelope: string) {
	expect(envelope.startsWith(ENV_ENCRYPTED_PREFIX)).toBe(true);
	const body = envelope.slice(ENV_ENCRYPTED_PREFIX.length);
	expect(parseEnvelopeFields(body).kid).toBe(kid);
	return JSON.parse(decryptEnvelope(body, privateKeyPem, kid)) as Record<string, unknown>;
}

describe('sealOperation', () => {
	it('seals a header the node opens, with a fresh response key and nonce of the right sizes', async () => {
		const now = 1_763_300_000_000;
		const { request, responseKey, nonce } = await sealOperation({ op, publicKey: publicKeyPem, kid, now });

		expect(Object.keys(request)).toEqual(['operation', 'envelope']);
		expect(request.operation).toBe('encrypted_operation');
		const header = openHeader(request.envelope);
		expect(header).toEqual({
			v: SEALED_OPERATION_VERSION,
			rk: Buffer.from(responseKey).toString('base64'),
			nonce,
			ts: now,
			op,
		});
		expect(responseKey).toHaveLength(RESPONSE_KEY_BYTES);
		expect(Buffer.from(nonce, 'base64')).toHaveLength(NONCE_BYTES);
		expect(request.envelope).not.toContain(op.password);
	});

	it('carries the actor only when given', async () => {
		const { request } = await sealOperation({ op, publicKey: publicKeyPem, kid, actor: 'studio' });
		expect(openHeader(request.envelope).actor).toBe('studio');
	});

	it('never repeats a response key or nonce', async () => {
		const seen = await Promise.all(
			Array.from({ length: 5 }, () => sealOperation({ op, publicKey: publicKeyPem, kid })),
		);
		expect(new Set(seen.map(({ nonce }) => nonce)).size).toBe(5);
		expect(new Set(seen.map(({ responseKey }) => Buffer.from(responseKey).toString('base64'))).size).toBe(5);
	});

	it('writes the same header the reference client writes', async () => {
		const now = Date.now();
		const ours = openHeader((await sealOperation({ op, publicKey: publicKeyPem, kid, now })).request.envelope);
		const theirs = openHeader(
			referenceSealOperation({ op, publicKey: publicKeyPem, kid, now }).request.envelope as string,
		);
		expect(Object.keys(ours).sort()).toEqual(Object.keys(theirs).sort());
		expect(ours.op).toEqual(theirs.op);
	});
});

describe('openSealedResponse', () => {
	async function sealedByTheNode(result: object) {
		const { responseKey, nonce } = await sealOperation({ op, publicKey: publicKeyPem, kid });
		return { payload: sealResponse(JSON.stringify(result), Buffer.from(responseKey), nonce), responseKey, nonce };
	}

	it("opens the node's answer to this request", async () => {
		const result = { status: 200, body: { message: 'owner@example.com successfully added' } };
		const { payload, responseKey, nonce } = await sealedByTheNode(result);

		expect(await openSealedResponse(payload, responseKey, nonce)).toEqual(result);
		// and reads it the same way the reference does
		expect(openResponse(payload, Buffer.from(responseKey), nonce)).toEqual(result);
	});

	it('keeps a failing status and the executed flag', async () => {
		const result = { status: 500, body: { error: 'The sealed operation failed' }, executed: true };
		const { payload, responseKey, nonce } = await sealedByTheNode(result);

		expect(await openSealedResponse(payload, responseKey, nonce)).toEqual(result);
	});

	it.each([
		['a tampered ciphertext', (p: { ct: string }) => ({ ...p, ct: flipFirstByte(p.ct) })],
		['a tampered tag', (p: { tag: string }) => ({ ...p, tag: flipFirstByte(p.tag) })],
		['another version', (p: object) => ({ ...p, v: 2 })],
		['a missing field', (p: { tag: string }) => ({ ...p, tag: undefined })],
	])('refuses %s', async (_, tamper) => {
		const { payload, responseKey, nonce } = await sealedByTheNode({ status: 200, body: {} });

		await expect(openSealedResponse(tamper(payload), responseKey, nonce)).rejects.toThrow();
	});

	it("refuses another request's nonce and another request's key", async () => {
		const { payload, responseKey, nonce } = await sealedByTheNode({ status: 200, body: {} });
		const other = await sealOperation({ op, publicKey: publicKeyPem, kid });

		await expect(openSealedResponse(payload, responseKey, other.nonce)).rejects.toThrow('did not authenticate');
		await expect(openSealedResponse(payload, other.responseKey, nonce)).rejects.toThrow('did not authenticate');
	});

	it('refuses an answer that is not a status and body', async () => {
		const { payload, responseKey, nonce } = await sealedByTheNode({ body: 'no status' });

		await expect(openSealedResponse(payload, responseKey, nonce)).rejects.toThrow('malformed');
	});
});

function flipFirstByte(base64: string): string {
	const bytes = Buffer.from(base64, 'base64');
	bytes[0] ^= 0xff;
	return bytes.toString('base64');
}
