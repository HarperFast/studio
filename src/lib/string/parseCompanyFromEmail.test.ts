import { describe, expect, it } from 'vitest';
import { parseCompanyFromEmail } from './parseCompanyFromEmail';

describe('parseCompanyFromEmail', () => {
	describe('basic functionality', () => {
		it('should extract domain from email address', () => {
			expect(parseCompanyFromEmail('user@example.com')).toBe('example.com');
			expect(parseCompanyFromEmail('john.doe@company.co.uk')).toBe('company.co.uk');
			expect(parseCompanyFromEmail('info@startup-name.io')).toBe('startup-name.io');
		});
	});

	describe('edge cases', () => {
		it('should handle emails with multiple @ symbols', () => {
			expect(parseCompanyFromEmail('user@domain@example.com')).toBe('example.com');
		});

		it('should return null for invalid email formats', () => {
			expect(parseCompanyFromEmail('invalid-email')).toBeNull();
			expect(parseCompanyFromEmail('invalid@')).toBeNull();
			expect(parseCompanyFromEmail('')).toBeNull();
		});
	});

	describe('common public email providers', () => {
		it('should return null for common email providers', () => {
			expect(parseCompanyFromEmail('user@gmail.com')).toBeNull();
			expect(parseCompanyFromEmail('user@yahoo.com')).toBeNull();
			expect(parseCompanyFromEmail('user@hotmail.com')).toBeNull();
			expect(parseCompanyFromEmail('user@outlook.com')).toBeNull();
			expect(parseCompanyFromEmail('user@icloud.com')).toBeNull();
			expect(parseCompanyFromEmail('user@aol.com')).toBeNull();
			expect(parseCompanyFromEmail('user@protonmail.com')).toBeNull();
			expect(parseCompanyFromEmail('user@mail.com')).toBeNull();
		});

		it('should return null for subdomains of common providers', () => {
			expect(parseCompanyFromEmail('user@mail.yahoo.com')).toBeNull();
			expect(parseCompanyFromEmail('user@business.gmail.com')).toBeNull();
		});

		it('should return domain for non-common email providers', () => {
			expect(parseCompanyFromEmail('user@acme.com')).toBe('acme.com');
			expect(parseCompanyFromEmail('employee@company.org')).toBe('company.org');
			expect(parseCompanyFromEmail('contact@startup.io')).toBe('startup.io');
		});
	});
});
