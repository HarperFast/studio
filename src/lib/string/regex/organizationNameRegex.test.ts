import { describe, expect, it } from 'vitest';
import { organizationNameRegex } from './organizationNameRegex';

describe('organizationNameRegex', () => {
	it('matches names of English letters, digits, spaces and name punctuation', () => {
		const validNames = ['A', '3M', 'My Org', "Ben & Jerry's", 'Acme, Inc. (EU)', 'Devin’s Org', 'Rock-Paper Co.'];
		for (const name of validNames) {
			expect(organizationNameRegex.test(name), name).toBe(true);
		}
	});

	it('does not match a name that starts with anything but a letter or digit', () => {
		const invalidNames = ['', "'s-Hertogenbosch", '-Acme', ' Acme', '(Acme)', '.Acme', '=1+1', '+Acme', '@Acme'];
		for (const name of invalidNames) {
			expect(organizationNameRegex.test(name), name).toBe(false);
		}
	});

	it('does not match markup, template, path or other symbols', () => {
		const invalidNames = ['a@b', 'a<b', 'a>b', 'a{b', 'a}b', 'a"b', 'a/b', 'a\\b', 'a;b', 'a_b', 'a!b', 'a#b'];
		for (const name of invalidNames) {
			expect(organizationNameRegex.test(name), name).toBe(false);
		}
	});

	it('does not match accented or non-Latin letters, or whitespace other than a space', () => {
		const invalidNames = ['José', 'Łukasz', '株式会社', 'شركة', 'a\nb', 'a\tb', 'a\u0000b', 'a\u00a0b', 'Acme\n'];
		for (const name of invalidNames) {
			expect(organizationNameRegex.test(name), name).toBe(false);
		}
	});
});
