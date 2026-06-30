import { describe, expect, it } from 'vitest';
import { SSHKeySchema } from './addSSHKey';

const validKey = {
	name: 'my-repo',
	key: 'PRIVATE KEY',
	host: 'my-repo.github.com',
	hostname: 'github.com',
};

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
			}
		}
	});

	it('rejects an alias equal to the hostname (case-insensitive)', () => {
		const result = SSHKeySchema.safeParse({ ...validKey, host: 'Repo.Internal', hostname: 'repo.internal' });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toEqual(['host']);
		}
	});

	it('still requires host and hostname to be present', () => {
		expect(SSHKeySchema.safeParse({ ...validKey, host: '' }).success).toBe(false);
		expect(SSHKeySchema.safeParse({ ...validKey, hostname: '' }).success).toBe(false);
	});
});
