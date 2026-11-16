// @vitest-environment node
// A fake 5.4 node built from Harper's reference client; it refuses the way `components/encryptedOperation.ts` does.
import { sealResponse } from '@/lib/crypto/__tests__/harper-v5.4.0/sealedOperation';
import {
	decryptEnvelope,
	fingerprintOf,
	parseEnvelopeFields,
} from '@/lib/crypto/__tests__/harper-v5.4.0/secretEnvelope';
import { ENV_ENCRYPTED_PREFIX } from '@/lib/crypto/envSecret';
import { AxiosError, AxiosHeaders, type AxiosInstance } from 'axios';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	_resetClockOffsetsForTests,
	isSealedRefusal,
	runSealedOperation,
	SealedOperationError,
	UnreadableSealedAnswerError,
} from './sealedOperation';

function keyPair() {
	const { publicKey, privateKey } = generateKeyPairSync('rsa', {
		modulusLength: 2048,
		publicKeyEncoding: { type: 'spki', format: 'pem' },
		privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	});
	const publicKeyPem = publicKey as unknown as string;
	return {
		publicKey: publicKeyPem,
		privateKey: privateKey as unknown as string,
		fingerprint: fingerprintOf(publicKeyPem),
	};
}

const custody = keyPair();
const otherKey = keyPair();
const MAX_AGE_MS = 300_000;

function refusal(status: number, data: Record<string, unknown>) {
	const config = { headers: new AxiosHeaders() };
	return new AxiosError(`Request failed with status code ${status}`, AxiosError.ERR_BAD_REQUEST, config, undefined, {
		status,
		statusText: '',
		data,
		headers: {},
		config,
	});
}

/** The node: its clock may be skewed from the browser's, and it answers each sealed operation through `execute`. */
const node = {
	clockSkewMs: 0,
	custody: false,
	execute: (op: { operation: string }): { status: number; body: unknown; executed?: true } => ({
		status: 200,
		body: { message: `${op.operation} ran` },
	}),
	requests: [] as unknown[],
	answer(body: { operation?: unknown; envelope?: unknown }) {
		this.requests.push(body);
		if (body.operation !== 'encrypted_operation' || typeof body.envelope !== 'string') {
			throw refusal(400, { error: 'The request is malformed' });
		}
		if (!this.custody) {
			throw refusal(503, { error: 'secrets custody is not initialized on this node' });
		}
		const envelopeBody = body.envelope.slice(ENV_ENCRYPTED_PREFIX.length);
		if (parseEnvelopeFields(envelopeBody).kid !== custody.fingerprint) {
			throw refusal(409, {
				error: "The envelope's kid does not match this node's secrets key",
				custody_fingerprint: custody.fingerprint,
			});
		}
		const header = JSON.parse(decryptEnvelope(envelopeBody, custody.privateKey, custody.fingerprint));
		const now = Date.now() + this.clockSkewMs;
		if (Math.abs(now - header.ts) > MAX_AGE_MS) {
			throw refusal(400, { error: 'The sealed request is outside the accepted time window', server_time: now });
		}
		const result = this.execute(header.op);
		return { encrypted_response: sealResponse(JSON.stringify(result), Buffer.from(header.rk, 'base64'), header.nonce) };
	},
};

const answerAsNode = node.answer;

function clientFor(baseURL: string): AxiosInstance {
	return {
		defaults: { baseURL },
		post: vi.fn(async (_url: string, body: { operation?: unknown; envelope?: unknown }) => ({
			data: node.answer(body),
		})),
	} as unknown as AxiosInstance;
}

const instanceClient = clientFor('https://cm.example.com/Cluster/clu-1/operation');

const op = { operation: 'add_user', username: 'owner@example.com', password: 'secret-password', role: 'super_user' };
const key = { publicKey: custody.publicKey, fingerprint: custody.fingerprint };

beforeEach(() => {
	node.clockSkewMs = 0;
	node.custody = true;
	node.execute = (inner) => ({ status: 200, body: { message: `${inner.operation} ran` } });
	node.requests = [];
	node.answer = answerAsNode;
	_resetClockOffsetsForTests();
});

afterEach(() => {
	vi.clearAllMocks();
});

describe(runSealedOperation, () => {
	it("sends only the sealed envelope and opens the node's answer", async () => {
		const result = await runSealedOperation({ instanceClient, op, key });

		expect(result).toEqual({ status: 200, body: { message: 'add_user ran' } });
		expect(instanceClient.post).toHaveBeenCalledWith('/', {
			operation: 'encrypted_operation',
			envelope: expect.any(String),
		});
		expect(JSON.stringify(node.requests)).not.toContain('secret-password');
	});

	it("throws the operation's own failure, with its status and body", async () => {
		node.execute = () => ({ status: 409, body: { error: 'User owner@example.com already exists' } });

		const failure = await runSealedOperation({ instanceClient, op, key }).then(() => undefined, (e: unknown) => e);

		expect(failure).toBeInstanceOf(SealedOperationError);
		expect(failure).toMatchObject({
			operation: 'add_user',
			status: 409,
			message: 'User owner@example.com already exists',
		});
		expect(isSealedRefusal(failure, 409, 'User owner@example.com already exists')).toBe(true);
		expect(isSealedRefusal(failure, 404, 'User owner@example.com already exists')).toBe(false);
	});

	it('keeps a failure that ran but could not answer, so the caller does not resend it', async () => {
		node.execute = () => ({ status: 500, body: { error: 'The sealed operation failed' }, executed: true });

		await expect(runSealedOperation({ instanceClient, op, key })).rejects.toMatchObject({
			status: 500,
			executed: true,
		});
	});

	it("retries once with the node's clock when the browser's is outside its window, and remembers the offset", async () => {
		node.clockSkewMs = 10 * 60_000;

		await runSealedOperation({ instanceClient, op, key });
		expect(node.requests).toHaveLength(2);

		await runSealedOperation({ instanceClient, op, key });
		expect(node.requests).toHaveLength(3);
	});

	it('does not retry a second time on a clock refusal', async () => {
		node.clockSkewMs = 10 * 60_000;
		const skewedNode = node.answer.bind(node);
		node.answer = (body) => {
			node.clockSkewMs += 10 * 60_000;
			return skewedNode(body);
		};

		await expect(runSealedOperation({ instanceClient, op, key })).rejects.toMatchObject({ response: { status: 400 } });
		expect(node.requests).toHaveLength(2);

		node.answer = answerAsNode;
		node.clockSkewMs = 0;
		await runSealedOperation({ instanceClient, op, key });
		expect(node.requests).toHaveLength(3);
	});

	it("learns each node's clock on its own", async () => {
		node.clockSkewMs = 10 * 60_000;
		await runSealedOperation({ instanceClient, op, key });
		expect(node.requests).toHaveLength(2);

		await runSealedOperation({ instanceClient: clientFor('https://cm.example.com/Cluster/clu-2/operation'), op, key });
		expect(node.requests).toHaveLength(4);
	});

	it('fetches the key again, once, when the envelope was sealed to another key', async () => {
		const stale = { publicKey: otherKey.publicKey, fingerprint: otherKey.fingerprint };
		const refreshKey = vi.fn(async () => key);

		const result = await runSealedOperation({ instanceClient, op, key: stale, refreshKey });

		expect(result.status).toBe(200);
		expect(refreshKey).toHaveBeenCalledTimes(1);
		expect(node.requests).toHaveLength(2);
	});

	it('throws the key refusal when there is no way to fetch the key, or the fetched key is refused too', async () => {
		const stale = { publicKey: otherKey.publicKey, fingerprint: otherKey.fingerprint };

		await expect(runSealedOperation({ instanceClient, op, key: stale })).rejects.toMatchObject({
			response: { status: 409, data: { custody_fingerprint: custody.fingerprint } },
		});
		await expect(runSealedOperation({ instanceClient, op, key: stale, refreshKey: async () => stale })).rejects
			.toMatchObject({ response: { status: 409 } });
		expect(node.requests).toHaveLength(3);
	});

	it('throws a node without custody as it answered', async () => {
		node.custody = false;

		await expect(runSealedOperation({ instanceClient, op, key })).rejects.toMatchObject({ response: { status: 503 } });
		expect(node.requests).toHaveLength(1);
	});

	it('opens a sealed answer that arrived on a failing HTTP status', async () => {
		vi.mocked(instanceClient.post).mockImplementationOnce(async (_url, body) => {
			const data = answerAsNode.call(node, body as { operation?: unknown; envelope?: unknown });
			throw refusal(409, data as unknown as Record<string, unknown>);
		});
		node.execute = () => ({ status: 409, body: { error: 'User owner@example.com already exists' } });

		await expect(runSealedOperation({ instanceClient, op, key })).rejects.toMatchObject({
			name: 'SealedOperationError',
			status: 409,
		});
	});

	it('refuses a replicated write some peer refused, as the direct path does', async () => {
		node.execute = () => ({
			status: 200,
			body: { message: 'added', replicated: [{ node: 'ins-2', status: 'failed', reason: 'peer down' }] },
		});

		await expect(runSealedOperation({ instanceClient, op, key })).rejects.toMatch(/Failed to replicate/);
	});

	it.each([
		['not sealed', () => ({ data: { message: 'add_user ran' } })],
		['malformed', () => ({ data: { encrypted_response: { v: 1, iv: 'AAAA', ct: 'AAAA', tag: 'AAAA' } } })],
		[
			"another request's",
			() => ({
				data: {
					encrypted_response: sealResponse(JSON.stringify({ status: 200, body: {} }), randomBytes(32), 'b3RoZXI='),
				},
			}),
		],
	])('reports an answer that is %s as one the operation may have run before', async (_, answer) => {
		vi.mocked(instanceClient.post).mockImplementationOnce(async (_url, body) => {
			answerAsNode.call(node, body as { operation?: unknown; envelope?: unknown });
			return answer();
		});

		await expect(runSealedOperation({ instanceClient, op, key })).rejects.toBeInstanceOf(UnreadableSealedAnswerError);
	});
});
