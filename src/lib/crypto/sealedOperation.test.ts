// @vitest-environment node
// Node env: Web Crypto (the helper) and node:crypto (Harper's reference client, see __tests__/harper-v5.4.0/README.md).
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	hashOperationText,
	NONCE_BYTES,
	openResponse,
	openValue,
	RESPONSE_KEY_BYTES,
	sealOperation as referenceSealOperation,
	sealResponse,
} from './__tests__/harper-v5.4.0/sealedOperation';
import { decryptEnvelope, fingerprintOf, parseEnvelopeFields } from './__tests__/harper-v5.4.0/secretEnvelope';
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

describe('sealOperation in fields mode', () => {
	const visibleFields = ['role', 'active'];
	const sealFields = (operation: Record<string, unknown> & { operation: string } = op) =>
		sealOperation({ op: operation, publicKey: publicKeyPem, kid, mode: 'fields', visibleFields });

	it('sends the operation as readable text with only the chosen keys in the clear', async () => {
		const { request } = await sealFields();

		expect(Object.keys(request)).toEqual(['operation', 'mode', 'op', 'envelope']);
		expect(request).toMatchObject({ operation: 'encrypted_operation', mode: 'fields' });
		const visible = JSON.parse((request as { op: string }).op);
		expect(Object.keys(visible)).toEqual(Object.keys(op));
		expect(visible).toMatchObject({ operation: 'add_user', role: 'super_user', active: true });
		expect(Object.keys(visible.username)).toEqual(['$sealed']);
		expect(Object.keys(visible.password)).toEqual(['$sealed']);
		for (const secret of [op.username, op.password]) {
			expect(JSON.stringify(request)).not.toContain(secret);
		}
	});

	it("binds the text to the envelope by the reference's hash, and carries no operation in the header", async () => {
		const { request, responseKey, nonce } = await sealFields();
		const header = openHeader(request.envelope);

		expect(header).not.toHaveProperty('op');
		expect(header).toEqual({
			v: SEALED_OPERATION_VERSION,
			rk: Buffer.from(responseKey).toString('base64'),
			nonce,
			ts: expect.any(Number),
			oph: hashOperationText((request as { op: string }).op),
		});
	});

	it('seals each leaf so the reference opens it only at its own location and under its own nonce', async () => {
		const { request, responseKey, nonce } = await sealFields();
		const visible = JSON.parse((request as { op: string }).op);
		const rk = Buffer.from(responseKey);

		expect(openValue(visible.username.$sealed, rk, nonce, '/username')).toBe(op.username);
		expect(openValue(visible.password.$sealed, rk, nonce, '/password')).toBe(op.password);
		expect(() => openValue(visible.username.$sealed, rk, nonce, '/password')).toThrow();
		const other = await sealFields();
		expect(() => openValue(visible.password.$sealed, rk, other.nonce, '/password')).toThrow();
	});

	it('escapes a key into its JSON Pointer token the way the reference does', async () => {
		const awkward = { operation: 'insert', 'a/b~c': { nested: [1, 'two'] } };
		const { request, responseKey, nonce } = await sealFields(awkward);
		const visible = JSON.parse((request as { op: string }).op);

		expect(openValue(visible['a/b~c'].$sealed, Buffer.from(responseKey), nonce, '/a~1b~0c')).toEqual({
			nested: [1, 'two'],
		});
	});

	it('leaves the same keys readable as the reference client by default', async () => {
		const tableOp = { operation: 'insert', database: 'data', table: 'dog', records: [{ id: 1 }] };
		const ours = JSON.parse(
			((await sealOperation({ op: tableOp, publicKey: publicKeyPem, kid, mode: 'fields' })).request as { op: string })
				.op,
		);
		const theirs = JSON.parse(
			referenceSealOperation({ op: tableOp, publicKey: publicKeyPem, kid, mode: 'fields' }).request.op as string,
		);
		const shape = (value: Record<string, unknown>) =>
			Object.fromEntries(
				Object.entries(value).map(([k, v]) => [k, (v as { $sealed?: string })?.$sealed ? 'sealed' : v]),
			);

		expect(shape(ours)).toEqual(shape(theirs));
	});

	it('refuses a value with no JSON form rather than sending a leaf the node cannot open', async () => {
		await expect(sealFields({ operation: 'add_user', username: undefined })).rejects.toThrow('/username');
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
