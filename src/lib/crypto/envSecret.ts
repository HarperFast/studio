/**
 * Client-side `enc:v1:` envelope encryption using the Web Crypto API, matching the backend contract
 * in core/docs/env-secret-encryption.md. Hybrid: AES-256-GCM encrypts the value, RSA-OAEP(SHA-256)
 * wraps the AES key. Secret values are encrypted in the browser and never leave it in plaintext.
 *
 *   enc:v1:<base64url(JSON{ kid, k, iv, ct, tag })>
 */

export const ENV_ENCRYPTED_PREFIX = 'enc:v1:';

function pemToDer(pem: string): Uint8Array {
	const b64 = pem
		.replace(/-----BEGIN [^-]+-----/, '')
		.replace(/-----END [^-]+-----/, '')
		.replace(/\s+/g, '');
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
	return bytes;
}

function toBase64(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i++) { s += String.fromCharCode(bytes[i]); }
	return btoa(s);
}

function toBase64Url(bytes: Uint8Array): string {
	return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

// Web Crypto's BufferSource typing (TS 5.7+) rejects Uint8Array<ArrayBufferLike>; hand it a plain
// ArrayBuffer copy of the bytes.
function ab(bytes: Uint8Array): ArrayBuffer {
	// Avoid a copy when the view already spans its whole buffer (the common case here).
	if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
		return bytes.buffer as ArrayBuffer;
	}
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// Web Crypto's SubtleCrypto is only available in secure contexts (HTTPS or localhost). Fail with a
// clear message rather than a cryptic `undefined` access when the app is served over plain HTTP.
function requireSubtle(): SubtleCrypto {
	if (typeof crypto === 'undefined' || !crypto.subtle) {
		throw new Error('Secret encryption requires a secure context (HTTPS or localhost).');
	}
	return crypto.subtle;
}

/** True if a value is an `enc:v1:` envelope rather than a plaintext value. */
export function isEncryptedEnvValue(value: unknown): value is string {
	return typeof value === 'string' && value.startsWith(ENV_ENCRYPTED_PREFIX);
}

/**
 * SHA-256 (hex) of the DER SPKI public key — the envelope `kid`. Matches the backend `fingerprintOf`
 * so a value encrypted here targets the right key during rotation.
 */
export async function fingerprintOf(publicKeyPem: string): Promise<string> {
	const subtle = requireSubtle();
	const der = pemToDer(publicKeyPem);
	return toHex(await subtle.digest('SHA-256', ab(der)));
}

/**
 * Encrypt a value into an `enc:v1:` envelope for the given public key. `kid` should be
 * `fingerprintOf(publicKeyPem)` (the server returns it alongside the key).
 */
export async function encryptEnvelope(plaintext: string, publicKeyPem: string, kid: string): Promise<string> {
	const subtle = requireSubtle();
	const der = pemToDer(publicKeyPem);
	const rsaKey = await subtle.importKey('spki', ab(der), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, [
		'encrypt',
	]);

	const aesKeyBytes = crypto.getRandomValues(new Uint8Array(32));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const aesKey = await subtle.importKey('raw', ab(aesKeyBytes), { name: 'AES-GCM' }, false, ['encrypt']);

	const sealed = new Uint8Array(
		await subtle.encrypt(
			{ name: 'AES-GCM', iv: ab(iv), tagLength: 128 },
			aesKey,
			ab(new TextEncoder().encode(plaintext)),
		),
	);
	// Web Crypto appends the 16-byte GCM tag to the ciphertext; the backend expects them separate.
	const ct = sealed.slice(0, sealed.length - 16);
	const tag = sealed.slice(sealed.length - 16);
	const wrappedKey = new Uint8Array(await subtle.encrypt({ name: 'RSA-OAEP' }, rsaKey, ab(aesKeyBytes)));

	const envelope = {
		kid,
		k: toBase64(wrappedKey),
		iv: toBase64(iv),
		ct: toBase64(ct),
		tag: toBase64(tag),
	};
	return ENV_ENCRYPTED_PREFIX + toBase64Url(new TextEncoder().encode(JSON.stringify(envelope)));
}
