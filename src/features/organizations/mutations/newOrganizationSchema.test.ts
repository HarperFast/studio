import { organizationNameRegex } from '@/lib/string/regex/organizationNameRegex';
import { describe, expect, it } from 'vitest';
import {
	defaultOrganizationName,
	defaultSubdomainSource,
	FALLBACK_ORGANIZATION_NAME,
	NewOrganizationSchema,
} from './newOrganizationSchema';

const NAME_CHARACTERS_ERROR =
	"Please only use letters A–Z, digits, spaces and ' ’ - . , & ( ) in the name. Must start with a letter or digit.";

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

		it('allows English letters, digits, spaces and name punctuation', () => {
			for (const name of ["Ben & Jerry's", 'Acme, Inc. (EU)', 'Devin’s Org', '3M', 'a'.repeat(255)]) {
				expect(NewOrganizationSchema.safeParse({ ...validBase, name }).success, name).toBe(true);
			}
		});

		it('invalidates other characters, and a name not starting with a letter or digit', () => {
			const invalidNames = [
				'@mallory@evil.com',
				'<b>Acme</b>',
				'{{value}}',
				'=1+1',
				'-Acme',
				' Acme',
				'José',
				'株式会社',
			];
			for (const name of invalidNames) {
				const result = NewOrganizationSchema.safeParse({ ...validBase, name });
				expect(result.success, name).toBe(false);
				if (!result.success) {
					expect(result.error.issues[0].message).toBe(NAME_CHARACTERS_ERROR);
				}
			}
		});

		it('invalidates a missing or non-string name', () => {
			for (const name of [undefined, null, 123]) {
				expect(NewOrganizationSchema.safeParse({ ...validBase, name }).success).toBe(false);
			}
		});
	});

	describe('defaultOrganizationName', () => {
		it("is the user's name with accents removed", () => {
			expect(defaultOrganizationName('Ada', 'Lovelace')).toBe('Ada Lovelace Org');
			expect(defaultOrganizationName('José', 'García')).toBe('Jose Garcia Org');
			expect(defaultOrganizationName('Zoë', 'Müller-Lüdenscheidt')).toBe('Zoe Muller-Ludenscheidt Org');
			expect(defaultOrganizationName('Seán', "O'Brien")).toBe("Sean O'Brien Org");
		});

		it('leaves out an empty name part, and falls back when there is no name', () => {
			expect(defaultOrganizationName('Cher', '')).toBe('Cher Org');
			expect(defaultOrganizationName(' José ', 'García')).toBe('Jose Garcia Org');
			expect(defaultOrganizationName('', '')).toBe(FALLBACK_ORGANIZATION_NAME);
			expect(defaultOrganizationName(undefined, undefined)).toBe(FALLBACK_ORGANIZATION_NAME);
		});

		it("falls back when the user's name has letters with no unaccented form, or a leading symbol", () => {
			const users = [
				['Łukasz', 'Nowak'],
				['Øystein', 'Berg'],
				['Ada', 'Weiß'],
				['Æsa', 'Ng'],
				["'Nell", 'Kim'],
			];
			for (const [firstname, lastname] of users) {
				const name = defaultOrganizationName(firstname, lastname);
				expect(name, `${firstname} ${lastname}`).toBe(FALLBACK_ORGANIZATION_NAME);
			}
		});

		it('always produces a name the schema accepts', () => {
			expect(organizationNameRegex.test(FALLBACK_ORGANIZATION_NAME)).toBe(true);
			const longest = defaultOrganizationName('a'.repeat(40), 'b'.repeat(80));
			expect(NewOrganizationSchema.safeParse({ ...validBase, name: longest }).success).toBe(true);
			expect(defaultOrganizationName('a'.repeat(200), 'b'.repeat(200))).toBe(FALLBACK_ORGANIZATION_NAME);
		});
	});

	describe('defaultSubdomainSource', () => {
		it("is the user's unaccented name even when the display name falls back", () => {
			expect(defaultSubdomainSource('José', 'García')).toBe('Jose Garcia Org');
			expect(defaultSubdomainSource('Łukasz', 'Nowak')).toBe('Łukasz Nowak Org');
			expect(defaultSubdomainSource(' Ada ', '')).toBe('Ada Org');
		});

		it('falls back when there is no name, or no letter A–Z or digit in it', () => {
			expect(defaultSubdomainSource('', ' ')).toBe(FALLBACK_ORGANIZATION_NAME);
			expect(defaultSubdomainSource('太郎', '')).toBe(FALLBACK_ORGANIZATION_NAME);
			expect(defaultSubdomainSource('Иван', 'Петров')).toBe(FALLBACK_ORGANIZATION_NAME);
			expect(defaultSubdomainSource(undefined, undefined)).toBe(FALLBACK_ORGANIZATION_NAME);
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
