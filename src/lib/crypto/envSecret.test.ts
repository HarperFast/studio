// @vitest-environment node
// Runs in the node env so Web Crypto (globalThis.crypto.subtle, used by envSecret.ts) and node:crypto
// (used here to stand in for the backend decrypt) are both available.
import {
	constants,
	createDecipheriv,
	createHash,
	createPublicKey,
	generateKeyPairSync,
	privateDecrypt,
} from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encryptEnvelope, ENV_ENCRYPTED_PREFIX, fingerprintOf, isEncryptedEnvValue } from './envSecret';

// Mirrors the backend enc:v1 decrypt (harper-pro envSecretCrypto / central-manager deploymentSecrets):
// RSA-OAEP(SHA-256) unwraps the AES key, AES-256-GCM decrypts the value.
function backendDecrypt(value: string, privateKeyPem: string): string {
	const env = JSON.parse(Buffer.from(value.slice(ENV_ENCRYPTED_PREFIX.length), 'base64url').toString('utf8'));
	const aesKey = privateDecrypt(
		{ key: privateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
		Buffer.from(env.k, 'base64'),
	);
	const decipher = createDecipheriv('aes-256-gcm', aesKey, Buffer.from(env.iv, 'base64'));
	decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
	return Buffer.concat([decipher.update(Buffer.from(env.ct, 'base64')), decipher.final()]).toString('utf8');
}

// 2048-bit key keeps the test fast; the envelope code paths are identical at any RSA size.
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
	modulusLength: 2048,
	publicKeyEncoding: { type: 'spki', format: 'pem' },
	privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const publicKeyPem = publicKey as unknown as string;

describe('envSecret (browser enc:v1)', () => {
	it('fingerprintOf matches the backend (sha256 of DER SPKI)', async () => {
		const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
		const expected = createHash('sha256').update(der).digest('hex');
		expect(await fingerprintOf(publicKeyPem)).toBe(expected);
	});

	it('encrypts values the backend can decrypt (round-trip interop)', async () => {
		const kid = await fingerprintOf(publicKeyPem);
		const samples = [
			'sk-1234567890',
			'p@ss w#rd"with\'quotes',
			'multi\nline\nvalue',
			'unicode: café 🔐 日本語',
			'-----BEGIN PRIVATE KEY-----\n' + 'A'.repeat(1500) + '\n-----END PRIVATE KEY-----\n',
			'',
		];
		for (const value of samples) {
			const envelope = await encryptEnvelope(value, publicKeyPem, kid);
			expect(isEncryptedEnvValue(envelope)).toBe(true);
			expect(backendDecrypt(envelope, privateKey as unknown as string)).toBe(value);
		}
	});

	it('produces a fresh iv/key each call (no nonce reuse)', async () => {
		const kid = await fingerprintOf(publicKeyPem);
		const a = await encryptEnvelope('same', publicKeyPem, kid);
		const b = await encryptEnvelope('same', publicKeyPem, kid);
		expect(a).not.toBe(b);
	});

	it('isEncryptedEnvValue only matches the enc:v1 prefix', () => {
		expect(isEncryptedEnvValue('plain')).toBe(false);
		expect(isEncryptedEnvValue('enc:v2:x')).toBe(false);
		expect(isEncryptedEnvValue(undefined)).toBe(false);
	});
});
