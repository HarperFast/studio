import { describe, expect, it } from 'vitest';
import { ALL_ORGANIZATIONS_PAGE_SIZE, buildAllOrganizationsUrl } from './getAllOrganizations';

describe('buildAllOrganizationsUrl', () => {
	it('requests the first page sorted by name, with one extra record to detect a next page', () => {
		expect(buildAllOrganizationsUrl(0, '')).toBe('/Admin/Organization/?status=ne=DELETED&sort(name)&limit(0,13)');
	});

	it('excludes terminated organizations', () => {
		expect(buildAllOrganizationsUrl(0, '')).toContain('status=ne=DELETED');
	});

	it('offsets the limit window by the page index', () => {
		expect(buildAllOrganizationsUrl(2, '')).toBe('/Admin/Organization/?status=ne=DELETED&sort(name)&limit(24,37)');
	});

	it('puts the name filter before the status condition (the API ignores name when status comes first)', () => {
		expect(buildAllOrganizationsUrl(0, 'acme')).toBe(
			'/Admin/Organization/?name=ct=acme&status=ne=DELETED&sort(name)&limit(0,13)',
		);
	});

	it('URI-encodes the filter value', () => {
		expect(buildAllOrganizationsUrl(0, 'a&b=c')).toBe(
			'/Admin/Organization/?name=ct=a%26b%3Dc&status=ne=DELETED&sort(name)&limit(0,13)',
		);
	});

	it('keeps the page window aligned with the exported page size', () => {
		expect(buildAllOrganizationsUrl(1, '')).toBe(
			`/Admin/Organization/?status=ne=DELETED&sort(name)&limit(${ALL_ORGANIZATIONS_PAGE_SIZE},${
				ALL_ORGANIZATIONS_PAGE_SIZE * 2 + 1
			})`,
		);
	});
});
