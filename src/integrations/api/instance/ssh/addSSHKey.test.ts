import { describe, expect, it } from 'vitest';
import { refineAgainstExistingSSHKeys, SSHKeySchema } from './addSSHKey';
import { ED25519_PUBLIC_KEY, openSSHPrivateKey } from './testHelpers';

const validKey = {
	name: 'my-repo',
	key: openSSHPrivateKey(),
	host: 'my-repo.github.com',
	hostname: 'github.com',
};

function messagesFor(result: ReturnType<typeof SSHKeySchema.safeParse>, field: string) {
	return (result.error?.issues ?? []).filter((issue) => issue.path[0] === field).map((issue) => issue.message);
}

describe('SSHKeySchema host alias guard', () => {
	it('accepts a unique alias distinct from the hostname', () => {
		expect(SSHKeySchema.safeParse(validKey).success).toBe(true);
	});

	it('rejects a bare registry hostname as the alias', () => {
		for (const host of ['github.com', 'GitHub.com', 'ssh.github.com', 'gitlab.com', 'bitbucket.org']) {
			const result = SSHKeySchema.safeParse({ ...validKey, host });
			expect(result.success, `expected "${host}" to be rejected`).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].path).toEqual(['host']);
				// Guards against the refine custom message being dropped (e.g. wrong params key).
				expect(result.error.issues[0].message).toContain('Use a unique alias');
			}
		}
	});

	it('rejects an alias equal to the hostname (case-insensitive)', () => {
		const result = SSHKeySchema.safeParse({ ...validKey, host: 'Repo.Internal', hostname: 'repo.internal' });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toEqual(['host']);
			expect(result.error.issues[0].message).toContain('Host alias must differ from the hostname');
		}
	});

	it('still requires host and hostname to be present', () => {
		expect(SSHKeySchema.safeParse({ ...validKey, host: '' }).success).toBe(false);
		expect(SSHKeySchema.safeParse({ ...validKey, hostname: '' }).success).toBe(false);
	});
});

describe('SSHKeySchema field messages', () => {
	it.each([
		['name', 'Name is required.'],
		['host', 'Host is required.'],
		['hostname', 'Hostname is required.'],
		['key', 'Key is required.'],
	])('says %s is required, including when it holds only whitespace', (field, message) => {
		for (const value of ['', '   ']) {
			expect(messagesFor(SSHKeySchema.safeParse({ ...validKey, [field]: value }), field)[0]).toBe(message);
		}
	});

	it('explains the characters a name may use (the report in #1550)', () => {
		expect(messagesFor(SSHKeySchema.safeParse({ ...validKey, name: 'Spaces and (Parens)' }), 'name')).toEqual([
			'Can only contain letters, numbers, dashes and underscores.',
		]);
	});

	it('rejects a public key where the private key belongs', () => {
		expect(messagesFor(SSHKeySchema.safeParse({ ...validKey, key: ED25519_PUBLIC_KEY }), 'key')[0]).toContain(
			'This looks like a public key',
		);
	});

	it('parses the key to its normalized form', () => {
		const indented = openSSHPrivateKey().replaceAll('\n', '\n  ');
		expect(SSHKeySchema.parse({ ...validKey, key: `  ${indented}\n` }).key).toBe(openSSHPrivateKey());
	});
});

describe('SSHKeySchema host and hostname shapes', () => {
	it.each([
		'my repo.github.com', // ssh would read two patterns, "my" and "repo.github.com"
		'git@my-repo.github.com',
		'my-repo.github.com:22',
		'https://my-repo.github.com',
		'my-repo.github.com/org/repo',
		'*.github.com',
		'-deploy.github.com', // git and ssh refuse a host that could be read as an option
	])('rejects the alias %j', (host) => {
		expect(messagesFor(SSHKeySchema.safeParse({ ...validKey, host }), 'host')[0]).toContain(
			'Can only contain letters, numbers, dots, dashes and underscores',
		);
	});

	it.each([
		'github.com extra', // a HostName with two words stops ssh for every key on the node
		'git@github.com',
		'github.com:22',
		'https://github.com',
		'github.com/org/repo',
		'git@github.com:org/repo.git',
		'-github.com',
		':::',
		'2001:db8:::1',
	])('rejects the hostname %j', (hostname) => {
		expect(messagesFor(SSHKeySchema.safeParse({ ...validKey, hostname }), 'hostname')[0]).toBe(
			'Enter just the hostname, like "github.com" — no "git@", scheme, port or path.',
		);
	});

	it.each(['gitlab.example.com', 'git_server.internal', '10.0.0.5', 'fd00::5', '2001:db8::1', '::1', 'github.com.'])(
		'accepts the hostname %j',
		(hostname) => {
			expect(messagesFor(SSHKeySchema.safeParse({ ...validKey, hostname }), 'hostname')).toEqual([]);
		},
	);

	it('reports a whitespace-only alias as missing, not as matching an empty hostname', () => {
		expect(messagesFor(SSHKeySchema.safeParse({ ...validKey, host: '   ', hostname: '' }), 'host')[0]).toBe(
			'Host is required.',
		);
	});
});

describe('refineAgainstExistingSSHKeys', () => {
	const existingKeys = [
		{ name: 'website', host: 'website.github.com', hostname: 'github.com' },
		{ name: 'legacy' }, // list_ssh_keys omits host when it can't find the key's config block
	];
	const schema = SSHKeySchema.superRefine(refineAgainstExistingSSHKeys(existingKeys));

	it('accepts a key that shares nothing with the existing ones', () => {
		expect(schema.safeParse(validKey).success).toBe(true);
	});

	it('rejects a name that is already taken', () => {
		expect(messagesFor(schema.safeParse({ ...validKey, name: 'website' }), 'name')).toEqual([
			'A key with this name already exists. Pick another name, or edit that key to replace it.',
		]);
	});

	it('rejects an alias another key already uses, in any case', () => {
		expect(messagesFor(schema.safeParse({ ...validKey, host: 'Website.GitHub.com' }), 'host')).toEqual([
			'The key "website" already uses the alias "website.github.com". Each key needs its own.',
		]);
	});
});
