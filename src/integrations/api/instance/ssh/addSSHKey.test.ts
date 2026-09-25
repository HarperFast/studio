import { describe, expect, it } from 'vitest';
import { SSHKeySchema } from './addSSHKey';
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
