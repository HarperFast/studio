import { describe, expect, it } from 'vitest';
import { NewOrganizationSchema } from './newOrganizationSchema';

const validBase = {
	name: 'My Organization',
	subdomain: 'my-org',
};

describe('NewOrganizationSchema', () => {
	it('validates a correct object', () => {
		const result = NewOrganizationSchema.safeParse(validBase);
		expect(result.success).toBe(true);
	});

	describe('name', () => {
		it('allows valid names', () => {
			const result = NewOrganizationSchema.safeParse({ ...validBase, name: 'A' });
			expect(result.success).toBe(true);
		});

		it('has a max length of 255', () => {
			const result = NewOrganizationSchema.safeParse({ ...validBase, name: 'a'.repeat(256) });
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe('Name cannot be longer than 255 characters.');
			}
		});

		it('allows empty names (we provide a default value, in that case)', () => {
			const result = NewOrganizationSchema.safeParse({ ...validBase, name: '' });
			expect(result.success).toBe(true);
		});
	});

	describe('subdomain', () => {
		const validateSubdomain = (subdomain: any) => NewOrganizationSchema.safeParse({ ...validBase, subdomain });

		it('validates correct subdomains', () => {
			const validSubdomains = ['a', 'z', '0', '9', 'a1', '1a', 'a-b', 'a-1-b', 'my-organization-123'];
			validSubdomains.forEach((subdomain) => {
				const result = validateSubdomain(subdomain);
				expect(result.success, `Expected "${subdomain}" to be valid`).toBe(true);
			});
		});

		it('invalidates subdomains starting with a dash', () => {
			const result = validateSubdomain('-abc');
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe(
					'Please only use lowercase letters, digits and dashes (-) in the subdomain. Must not start or end with a dash.',
				);
			}
		});

		it('invalidates subdomains ending with a dash', () => {
			const result = validateSubdomain('abc-');
			expect(result.success).toBe(false);
		});

		it('invalidates subdomains with uppercase letters', () => {
			const result = validateSubdomain('Abc');
			expect(result.success).toBe(false);
		});

		it('invalidates subdomains with invalid characters', () => {
			const invalidSubdomains = ['abc.def', 'abc_def', 'abc!def', 'abc def'];
			invalidSubdomains.forEach((subdomain) => {
				const result = validateSubdomain(subdomain);
				expect(result.success, `Expected "${subdomain}" to be invalid`).toBe(false);
			});
		});

		it('has a max length of 62', () => {
			const result = validateSubdomain('a'.repeat(63));
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toBe('Must be at most 62 characters long.');
			}
		});

		it('can be left blank (undefined)', () => {
			const result = validateSubdomain(undefined);
			expect(result.success).toBe(true);
		});

		it('can be left blank (empty string)', () => {
			const result = validateSubdomain('');
			expect(result.success).toBe(true);
		});
	});
});
