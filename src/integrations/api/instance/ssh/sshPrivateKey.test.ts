import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { describeSSHPrivateKeyProblem, normalizeSSHKeyLines, sshPrivateKeySchema } from './sshPrivateKey';
import {
	armored,
	beginLine,
	ED25519_PUBLIC_KEY,
	endLine,
	OPENSSH_LABEL,
	openSSHKeyBody,
	openSSHPrivateKey,
	pemKeyBody,
} from './testHelpers';

const PEM_BODY = pemKeyBody();
const PASSPHRASE = 'This key is protected by a passphrase';
const PUBLIC_KEY = 'Paste the private key — the file without the .pub extension.';
const DAMAGED = "This key is damaged and can't be read.";
const NO_BREAK_SPACE = String.fromCharCode(0xa0);
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
function withoutLines(lines: string[], start: number, count: number) {
	return [...lines.slice(0, start), ...lines.slice(start + count)];
}

const DSA_OID = String.fromCharCode(0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x38, 0x04, 0x01);

describe('describeSSHPrivateKeyProblem', () => {
	it.each([
		['an OpenSSH key', openSSHPrivateKey()],
		['a PKCS#1 RSA key', armored('RSA PRIVATE KEY', PEM_BODY)],
		['an EC key', armored('EC PRIVATE KEY', PEM_BODY)],
		['a PKCS#8 key', armored('PRIVATE KEY', PEM_BODY)],
		['an OpenSSH RSA key', openSSHPrivateKey({ keyType: 'ssh-rsa' })],
		['an OpenSSH ECDSA key', openSSHPrivateKey({ keyType: 'ecdsa-sha2-nistp256' })],
	])('accepts %s', (_, key) => {
		expect(describeSSHPrivateKeyProblem(key)).toBeUndefined();
	});

	it.each([
		['PEM', armored('DSA PRIVATE KEY', PEM_BODY)],
		['OpenSSH', openSSHPrivateKey({ keyType: 'ssh-dss' })],
		[
			'PKCS#8',
			armored(
				'PRIVATE KEY',
				pemKeyBody(String.fromCharCode(0x02, 0x01, 0x00, 0x30, 0x09) + DSA_OID + '\0'.repeat(400)),
			),
		],
	])('refuses a %s DSA key, which OpenSSH 10 removed', (_, key) => {
		expect(describeSSHPrivateKeyProblem(key)).toContain('This is a DSA key');
	});

	it.each(['sk-ssh-ed25519@openssh.com', 'sk-ecdsa-sha2-nistp256@openssh.com'])(
		'refuses a %s key, which signs only with its hardware security key attached',
		(keyType) => {
			expect(describeSSHPrivateKeyProblem(openSSHPrivateKey({ keyType }))).toContain(
				'This key only works with its hardware security key attached',
			);
		},
	);

	it('leaves a key Harper Pro already sealed to the server', () => {
		expect(describeSSHPrivateKeyProblem('enc:v1:eyJraWQiOiJhYmMiLCJrIjoiLi4uIn0')).toBeUndefined();
	});

	it('leaves an empty key to the required check', () => {
		expect(describeSSHPrivateKeyProblem('  \n ')).toBeUndefined();
	});

	describe('a public key pasted in place of the private one', () => {
		it.each([
			['ssh-ed25519', ED25519_PUBLIC_KEY],
			['ssh-rsa', 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQExample user@host'],
			['ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYExample'],
			['sk-ssh-ed25519@openssh.com', 'sk-ssh-ed25519@openssh.com AAAAGnNrLXNzaC1lZDI1NTE5QG9wZW5zc2guY29tExample'],
			['ssh-ed25519-cert-v01@openssh.com', 'ssh-ed25519-cert-v01@openssh.com AAAAIHNzaC1lZDI1NTE5LWNlcnQExample'],
			// an authorized_keys line with options, and a known_hosts line, still hold a public key
			['ssh-ed25519', `no-pty,command="deploy" ${ED25519_PUBLIC_KEY}`],
			['ssh-ed25519', `github.com ${ED25519_PUBLIC_KEY}`],
		])('names it by its algorithm (%s)', (algorithm, key) => {
			expect(describeSSHPrivateKeyProblem(key)).toBe(`This looks like a public key ("${algorithm} …"). ${PUBLIC_KEY}`);
		});

		it.each([
			['PEM', armored('PUBLIC KEY', PEM_BODY)],
			['PKCS#1 PEM', armored('RSA PUBLIC KEY', PEM_BODY)],
			['RFC 4716', ['---- BEGIN SSH2 PUBLIC KEY ----', ...PEM_BODY, '---- END SSH2 PUBLIC KEY ----'].join('\n')],
		])('recognizes the %s export format too', (_, key) => {
			expect(describeSSHPrivateKeyProblem(key)).toBe(`This is a public key. ${PUBLIC_KEY}`);
		});
	});

	it.each([
		['OpenSSH', openSSHPrivateKey({ cipherName: 'aes256-ctr' })],
		['OpenSSH (chacha20)', openSSHPrivateKey({ cipherName: 'chacha20-poly1305@openssh.com' })],
		[
			'PEM',
			armored('RSA PRIVATE KEY', ['Proc-Type: 4,ENCRYPTED', 'DEK-Info: AES-128-CBC,FA45137F3A8AEE06', '', ...PEM_BODY]),
		],
		['PKCS#8', armored('ENCRYPTED PRIVATE KEY', PEM_BODY)],
	])("refuses a passphrase-protected %s key, which ssh can't unlock without a terminal", (_, key) => {
		expect(describeSSHPrivateKeyProblem(key)).toContain(PASSPHRASE);
	});

	it('refuses a PuTTY key', () => {
		const ppk = 'PuTTY-User-Key-File-3: ssh-ed25519\nEncryption: none\nComment: me@laptop\nPublic-Lines: 2';
		expect(describeSSHPrivateKeyProblem(ppk)).toContain('This is a PuTTY key (.ppk)');
	});

	it('names an armored block that is no private key at all', () => {
		expect(describeSSHPrivateKeyProblem(armored('CERTIFICATE', PEM_BODY))).toBe(
			`Expected an SSH private key, but found "${beginLine('CERTIFICATE')}".`,
		);
	});

	it.each([
		['prose', 'my github deploy key'],
		['a fingerprint', 'SHA256:k4F8irlPUWw4tsdm9YJLDfiq/Jcuz2BCEVe4k57F5f4'],
		['a body with no armor', openSSHKeyBody().join('\n')],
	])('refuses %s', (_, key) => {
		expect(describeSSHPrivateKeyProblem(key)).toContain("This doesn't look like a private key.");
	});

	it('refuses a key missing its END line, as a cut-off copy', () => {
		const truncated = [beginLine(OPENSSH_LABEL), ...openSSHKeyBody()].join('\n');
		expect(describeSSHPrivateKeyProblem(truncated)).toBe(
			`This key is incomplete: its "${endLine(OPENSSH_LABEL)}" line is missing. Copy the whole file.`,
		);
	});

	it('refuses an END line for a different label', () => {
		const mismatched = [beginLine(OPENSSH_LABEL), ...openSSHKeyBody(), endLine('RSA PRIVATE KEY')].join('\n');
		expect(describeSSHPrivateKeyProblem(mismatched)).toContain('This key is incomplete');
	});

	describe('text around the key', () => {
		it('refuses text before an OpenSSH key, which OpenSSH reads only from the first line', () => {
			expect(describeSSHPrivateKeyProblem(`${ED25519_PUBLIC_KEY}\n${openSSHPrivateKey()}`)).toBe(
				`Paste only the private key — remove the text before "${beginLine(OPENSSH_LABEL)}".`,
			);
		});

		it('allows text before a PEM key, which libcrypto skips', () => {
			expect(describeSSHPrivateKeyProblem(`Bag Attributes\n${armored('RSA PRIVATE KEY', PEM_BODY)}`)).toBeUndefined();
		});

		it('allows text after the END line, which every format ignores', () => {
			expect(describeSSHPrivateKeyProblem(`${openSSHPrivateKey()}\n${ED25519_PUBLIC_KEY}`)).toBeUndefined();
		});
	});

	describe('a damaged body', () => {
		it.each([
			['an empty OpenSSH body', armored(OPENSSH_LABEL, [])],
			['a non-base64 character', armored(OPENSSH_LABEL, [...openSSHKeyBody(), 'not*base64'])],
			['an OpenSSH body without its magic', armored(OPENSSH_LABEL, [btoa('openssh-key-v2\0')])],
			['an OpenSSH body cut inside its cipher name', armored(OPENSSH_LABEL, [btoa('openssh-key-v1\0\0\0\0\x0anon')])],
			[
				'an OpenSSH body that lost lines from its private section',
				armored(OPENSSH_LABEL, withoutLines(openSSHKeyBody(), 3, 2)),
			],
			[
				'an OpenSSH body with a line doubled',
				armored(OPENSSH_LABEL, [...openSSHKeyBody().slice(0, 4), ...openSSHKeyBody().slice(3)]),
			],
			['an OpenSSH private section whose check integers differ', openSSHPrivateKey({ checkInts: [1, 2] })],
			['an OpenSSH private section not in whole 8-byte blocks', openSSHPrivateKey({ blockSize: 1 })],
			['an OpenSSH body with bytes after its private section', openSSHPrivateKey({ trailing: 'extra' })],
			['an OpenSSH body holding two keys', armored(OPENSSH_LABEL, openSSHKeyBody({ keyCount: 2 }))],
			['a PEM body that lost a line', armored('RSA PRIVATE KEY', withoutLines(PEM_BODY, 4, 1))],
			['a PEM body with a line doubled', armored('RSA PRIVATE KEY', [...PEM_BODY.slice(0, 5), ...PEM_BODY.slice(4)])],
			['a PEM body that is no DER sequence', armored('EC PRIVATE KEY', [btoa('not a sequence')])],
			['an OpenSSH body cut before its public key', armored(OPENSSH_LABEL, [openSSHKeyBody().join('').slice(0, 44)])],
			// only spaces and tabs are skipped by ssh's base64 decoders; these survive normalization mid-line
			[
				'a no-break space inside a line',
				armored(OPENSSH_LABEL, openSSHKeyBody().map((line) => `${line.slice(0, 8)}${NO_BREAK_SPACE}${line.slice(8)}`)),
			],
			[
				'a byte-order mark inside a line',
				armored(OPENSSH_LABEL, openSSHKeyBody().map((line) => `${line.slice(0, 8)}${BYTE_ORDER_MARK}${line.slice(8)}`)),
			],
			[
				'a PEM body with smart quotes',
				armored('RSA PRIVATE KEY', ['“MIIEpAIBAAKCAQEAu1SU1LfVLPHCozMxH2Mo4lgOEePzNm0t”']),
			],
		])('refuses %s', (_, key) => {
			expect(describeSSHPrivateKeyProblem(key)).toContain(DAMAGED);
		});

		it("ignores whitespace inside a line, which both of ssh's base64 decoders skip", () => {
			const spaced = openSSHKeyBody().map((line) => `${line.slice(0, 10)} ${line.slice(10)}`);
			expect(describeSSHPrivateKeyProblem(armored(OPENSSH_LABEL, spaced))).toBeUndefined();
		});
	});
});

describe('describeSSHPrivateKeyProblem on real keys from node:crypto', () => {
	const publicKeyEncoding = { type: 'spki', format: 'pem' } as const;
	const multiLineKeys = {
		'an RSA key (PKCS#1)': generateKeyPairSync('rsa', {
			modulusLength: 2048,
			publicKeyEncoding,
			privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
		}).privateKey,
		'an RSA key (PKCS#8)': generateKeyPairSync('rsa', {
			modulusLength: 2048,
			publicKeyEncoding,
			privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
		}).privateKey,
		'an EC key (SEC1)': generateKeyPairSync('ec', {
			namedCurve: 'P-256',
			publicKeyEncoding,
			privateKeyEncoding: { type: 'sec1', format: 'pem' },
		}).privateKey,
	};
	const ed25519 = generateKeyPairSync('ed25519', {
		publicKeyEncoding,
		privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	}).privateKey;

	it.each([...Object.entries(multiLineKeys), ['an Ed25519 key (PKCS#8)', ed25519]])('accepts %s', (_, key) => {
		expect(describeSSHPrivateKeyProblem(key)).toBeUndefined();
	});

	it.each(Object.entries(multiLineKeys))('refuses %s with a line missing', (_, key) => {
		const lines = key.trim().split('\n');
		expect(describeSSHPrivateKeyProblem([...lines.slice(0, 2), ...lines.slice(3)].join('\n'))).toContain(DAMAGED);
	});

	it('refuses a passphrase-protected key', () => {
		const { privateKey } = generateKeyPairSync('rsa', {
			modulusLength: 2048,
			publicKeyEncoding,
			privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'correct horse' },
		});
		expect(describeSSHPrivateKeyProblem(privateKey)).toContain(PASSPHRASE);
	});

	it('refuses a DSA key', () => {
		const { privateKey } = generateKeyPairSync('dsa', {
			modulusLength: 2048,
			divisorLength: 256,
			publicKeyEncoding,
			privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
		});
		expect(describeSSHPrivateKeyProblem(privateKey)).toContain('This is a DSA key');
	});
});

describe('normalizeSSHKeyLines', () => {
	it('drops blank lines and the whitespace around each line', () => {
		expect(normalizeSSHKeyLines('\n  a  \n\n\tb\n   \nc \n')).toBe('a\nb\nc');
	});

	it("strips the carriage return of a CRLF line, including the last line's", () => {
		const crlf = openSSHPrivateKey().split('\n').join('\r\n') + '\r\n';
		expect(normalizeSSHKeyLines(crlf)).toBe(openSSHPrivateKey());
	});
});

describe('sshPrivateKeySchema', () => {
	it('parses to the normalized key, so an indented or double-spaced paste is stored as ssh can read it', () => {
		const indented = openSSHPrivateKey().split('\n').map((line) => `    ${line}`).join('\n\n');
		expect(sshPrivateKeySchema.parse(`\n${indented}\n`)).toBe(openSSHPrivateKey());
	});

	it('accepts a CRLF paste', () => {
		const crlf = armored('RSA PRIVATE KEY', PEM_BODY).split('\n').join('\r\n') + '\r\n';
		expect(sshPrivateKeySchema.safeParse(crlf).success).toBe(true);
	});

	it('requires a key, whitespace or not', () => {
		for (const key of ['', ' \n\t ']) {
			const result = sshPrivateKeySchema.safeParse(key);
			expect(result.success).toBe(false);
			expect(result.error?.issues[0].message).toBe('Key is required.');
		}
	});

	it('reports the problem as its message', () => {
		const result = sshPrivateKeySchema.safeParse(ED25519_PUBLIC_KEY);
		expect(result.success).toBe(false);
		expect(result.error?.issues.map((issue) => issue.message)).toEqual([
			`This looks like a public key ("ssh-ed25519 …"). ${PUBLIC_KEY}`,
		]);
	});
});
