import { z } from 'zod';

/*
 * Harper stores an SSH key exactly as it is sent: `add_ssh_key` and `update_ssh_key` check only that
 * `key` is a string. The first thing to read it is ssh, as the `IdentityFile` of a git deploy, where
 * a key it can't use fails as a generic auth error — so each check here is a way ssh fails on a key.
 */

/** A key Harper Pro already sealed (e.g. copied from `get_ssh_key`); the server vets it, and it can't be read here. */
const SEALED_KEY_PREFIX = 'enc:v1:';

const PEM_BEGIN = /^-----BEGIN ([A-Z0-9 ]+)-----$/;

/** The formats ssh reads: its own, plus what libcrypto's PEM reader hands it. */
const PRIVATE_KEY_LABELS = new Set([
	'OPENSSH PRIVATE KEY',
	'RSA PRIVATE KEY',
	'DSA PRIVATE KEY',
	'EC PRIVATE KEY',
	'PRIVATE KEY',
	'ENCRYPTED PRIVATE KEY',
]);

const PUBLIC_KEY_LABELS = new Set(['PUBLIC KEY', 'RSA PUBLIC KEY']);

const SSH2_PUBLIC_KEY_BEGIN = '---- BEGIN SSH2 PUBLIC KEY ----';

/** The key blob after the algorithm starts with a 4-byte length, so its base64 always starts with "AAAA". */
const PUBLIC_KEY_LINE =
	/(?:^|\s)((?:ssh-(?:rsa|dss|ed25519)|ecdsa-sha2-nistp(?:256|384|521)|sk-(?:ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com)(?:-cert-v01@openssh\.com)?)\s+AAAA/m;

const PEM_ENCRYPTED_HEADER = /^Proc-Type:\s*4,\s*ENCRYPTED$/i;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const OPENSSH_KEY_MAGIC = 'openssh-key-v1\0';

const DSA_ALGORITHM_OID = String.fromCharCode(0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x38, 0x04, 0x01);

const FOR_EXAMPLE_A_NEW_KEY = ' — for example, a new deploy key from ssh-keygen -t ed25519 -N "".';

const PASSPHRASE_PROTECTED = "This key is protected by a passphrase, which Harper can't enter when it runs git. "
	+ `Use a key without one${FOR_EXAMPLE_A_NEW_KEY}`;

const DSA_KEY = `This is a DSA key, which current ssh no longer accepts. Use an Ed25519 key${FOR_EXAMPLE_A_NEW_KEY}`;

const SECURITY_KEY = 'This key only works with its hardware security key attached, and the server Harper runs git on '
	+ `has none. Use a regular key${FOR_EXAMPLE_A_NEW_KEY}`;

const DAMAGED = "This key is damaged and can't be read. Copy it again from the original file.";

/**
 * Blank lines and the whitespace around each line are never part of a key, and both break one: ssh
 * finds an END line only at the start of a line, and libcrypto rejects a PEM body with a blank line.
 */
export function normalizeSSHKeyLines(key: string): string {
	return key.split('\n').map((line) => line.trim()).filter(Boolean).join('\n');
}

/**
 * Explains why ssh can't use `key` as a private key, or returns undefined when it can — or when
 * that can't be judged here (a key Harper Pro has already sealed).
 */
export function describeSSHPrivateKeyProblem(key: string): string | undefined {
	const text = normalizeSSHKeyLines(key);
	if (!text || text.startsWith(SEALED_KEY_PREFIX)) {
		return undefined;
	}

	const lines = text.split('\n');
	const labels = lines.map((line) => PEM_BEGIN.exec(line)?.[1]);
	const beginIndex = labels.findIndex((label) => label !== undefined && PRIVATE_KEY_LABELS.has(label));
	if (beginIndex === -1) {
		return describeNonPrivateKey(text, lines, labels);
	}

	// OpenSSH reads its own format only from a file that starts with the BEGIN line, while
	// libcrypto's PEM reader skips whatever precedes it — so only this format minds leading text.
	const label = labels[beginIndex] as string;
	if (beginIndex > 0 && label === 'OPENSSH PRIVATE KEY') {
		return `Paste only the private key — remove the text before "${lines[beginIndex]}".`;
	}

	const endLine = `-----END ${label}-----`;
	const endIndex = lines.indexOf(endLine, beginIndex + 1);
	if (endIndex === -1) {
		return `This key is incomplete: its "${endLine}" line is missing. Copy the whole file.`;
	}

	// Anything after the END line is ignored by every format, so a public key pasted after it is harmless.
	return describeKeyBody(label, lines.slice(beginIndex + 1, endIndex));
}

function describeNonPrivateKey(text: string, lines: string[], labels: Array<string | undefined>) {
	if (text.startsWith('PuTTY-User-Key-File-')) {
		return "This is a PuTTY key (.ppk), which ssh can't read. "
			+ 'In PuTTYgen, choose Conversions → Export OpenSSH key, and paste that file instead.';
	}
	if (
		lines.includes(SSH2_PUBLIC_KEY_BEGIN)
		|| labels.some((label) => label !== undefined && PUBLIC_KEY_LABELS.has(label))
	) {
		return 'This is a public key. Paste the private key — the file without the .pub extension.';
	}
	const otherLabel = labels.find((label) => label !== undefined);
	if (otherLabel) {
		return `Expected an SSH private key, but found "-----BEGIN ${otherLabel}-----".`;
	}
	const publicKeyAlgorithm = PUBLIC_KEY_LINE.exec(text)?.[1];
	if (publicKeyAlgorithm) {
		return `This looks like a public key ("${publicKeyAlgorithm} …"). `
			+ 'Paste the private key — the file without the .pub extension.';
	}
	return "This doesn't look like a private key. "
		+ 'Paste the whole key file, including its "-----BEGIN" and "-----END" lines.';
}

function describeKeyBody(label: string, bodyLines: string[]) {
	if (label === 'DSA PRIVATE KEY') {
		return DSA_KEY;
	}
	if (label === 'ENCRYPTED PRIVATE KEY' || bodyLines.some((line) => PEM_ENCRYPTED_HEADER.test(line))) {
		return PASSPHRASE_PROTECTED;
	}

	// Spaces and tabs are the only whitespace both of ssh's base64 decoders skip inside a line.
	const base64 = bodyLines.join('').replace(/[ \t]+/g, '');
	const bytes = BASE64.test(base64) ? decodeBase64(base64) : undefined;
	if (bytes === undefined) {
		return DAMAGED;
	}

	if (label !== 'OPENSSH PRIVATE KEY') {
		// A PEM body is exactly one DER SEQUENCE, so a lost or doubled line shows as a length mismatch.
		if (derSequenceLength(bytes) !== bytes.length) {
			return DAMAGED;
		}
		return label === 'PRIVATE KEY' && bytes.slice(0, 32).includes(DSA_ALGORITHM_OID) ? DSA_KEY : undefined;
	}

	const key = readOpenSSHKey(bytes);
	if (!key) {
		return DAMAGED;
	}
	if (key.keyType === 'ssh-dss') {
		return DSA_KEY;
	}
	if (key.keyType.startsWith('sk-')) {
		return SECURITY_KEY;
	}
	if (key.cipherName !== 'none') {
		return PASSPHRASE_PROTECTED;
	}
	return isIntactPrivateSection(key.privateSection, key.trailingBytes) ? undefined : DAMAGED;
}

/**
 * Unencrypted, the private section runs to the end of the key in whole 8-byte blocks and opens with two
 * equal check integers (PROTOCOL.key), so a line lost or doubled in a paste breaks at least one of these.
 */
function isIntactPrivateSection(section: string | undefined, trailingBytes: number) {
	if (!section || trailingBytes !== 0 || section.length % 8 !== 0) {
		return false;
	}
	const checkInts = sshFieldReader(section, 0);
	const first = checkInts.uint32();
	return first !== undefined && first === checkInts.uint32();
}

function decodeBase64(base64: string) {
	try {
		return atob(base64);
	} catch {
		return undefined;
	}
}

function derSequenceLength(bytes: string) {
	if (bytes.length < 2 || bytes.charCodeAt(0) !== 0x30) {
		return undefined;
	}
	const lengthByte = bytes.charCodeAt(1);
	if (lengthByte < 0x80) {
		return 2 + lengthByte;
	}
	const lengthSize = lengthByte & 0x7f;
	if (lengthSize === 0 || lengthSize > 3 || bytes.length < 2 + lengthSize) {
		return undefined;
	}
	let length = 0;
	for (let index = 0; index < lengthSize; index++) {
		length = length * 256 + bytes.charCodeAt(2 + index);
	}
	return 2 + lengthSize + length;
}

/** The OpenSSH key container, laid out in PROTOCOL.key in the OpenSSH source. */
function readOpenSSHKey(bytes: string) {
	if (!bytes.startsWith(OPENSSH_KEY_MAGIC)) {
		return undefined;
	}
	const fields = sshFieldReader(bytes, OPENSSH_KEY_MAGIC.length);
	const cipherName = fields.string();
	const kdfName = fields.string();
	const kdfOptions = fields.string();
	const keyCount = fields.uint32();
	const publicKey = fields.string();
	if (cipherName === undefined || kdfName === undefined || kdfOptions === undefined || keyCount !== 1 || !publicKey) {
		return undefined;
	}
	const keyType = sshFieldReader(publicKey, 0).string();
	if (keyType === undefined) {
		return undefined;
	}
	return { cipherName, keyType, privateSection: fields.string(), trailingBytes: fields.remaining() };
}

function sshFieldReader(bytes: string, start: number) {
	let at = start;
	const uint32 = () => {
		if (bytes.length < at + 4) {
			return undefined;
		}
		const value = ((bytes.charCodeAt(at) << 24) | (bytes.charCodeAt(at + 1) << 16) | (bytes.charCodeAt(at + 2) << 8)
			| bytes.charCodeAt(at + 3)) >>> 0;
		at += 4;
		return value;
	};
	const string = () => {
		const length = uint32();
		if (length === undefined || bytes.length < at + length) {
			return undefined;
		}
		at += length;
		return bytes.slice(at - length, at);
	};
	return { uint32, string, remaining: () => bytes.length - at };
}

/**
 * A private key field. It parses to the key as `normalizeSSHKeyLines` leaves it; callers still owe it
 * a trailing newline, since ssh rejects a key file whose END line isn't newline-terminated.
 */
export const sshPrivateKeySchema = z
	.string()
	.overwrite(normalizeSSHKeyLines)
	.min(1, { error: 'Key is required.' })
	.superRefine((key, ctx) => {
		const problem = describeSSHPrivateKeyProblem(key);
		if (problem) {
			ctx.addIssue({ code: 'custom', message: problem });
		}
	});
