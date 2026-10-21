import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get } }));

import { getStaffUser, isStaffEmail, searchStaffUsers, STAFF_USER_SEARCH_LIMIT } from './staffUsers';

const user = (id: string, email: string) => ({ id, email, firstname: 'F', lastname: 'L', status: 'ACTIVE' });

describe('searchStaffUsers', () => {
	beforeEach(() => get.mockReset());

	it('asks for active, verified users by lower-cased email prefix, bounded and sorted', async () => {
		get.mockResolvedValue({ data: [] });

		await searchStaffUsers('  Dav@Harper');

		const url = get.mock.calls[0][0] as string;
		// Trailing slash required for the rows rather than the collection descriptor.
		expect(url.startsWith('/Admin/User/?')).toBe(true);
		// The `*` is Harper's prefix match and must stay unencoded; the prefix itself is encoded.
		expect(url).toContain('email=dav%40harper*');
		expect(url).toContain('status=ACTIVE');
		expect(url).toContain('isVerified=true');
		expect(url).toContain('sort(email)');
		expect(url).toContain(`limit(0,${STAFF_USER_SEARCH_LIMIT})`);
	});

	// A token can only act as Harper staff; the mint refuses any other owner, so the picker must
	// not offer one even when the prefix matches a customer.
	it('keeps only staff-domain accounts, projected to what the picker needs', async () => {
		get.mockResolvedValue({
			data: [
				{ ...user('usr-1', 'dave@harperdb.io'), roles: [] },
				user('usr-2', 'dave@example.com'),
				user('usr-3', 'Dawn@HarperDB.io'),
			],
		});

		expect(await searchStaffUsers('da')).toEqual([
			{ id: 'usr-1', email: 'dave@harperdb.io', firstname: 'F', lastname: 'L' },
			{ id: 'usr-3', email: 'Dawn@HarperDB.io', firstname: 'F', lastname: 'L' },
		]);
	});
});

describe('isStaffEmail', () => {
	it('matches the staff domain only, whatever its case', () => {
		expect(isStaffEmail('a@harperdb.io')).toBe(true);
		expect(isStaffEmail('a@HarperDB.IO')).toBe(true);
		expect(isStaffEmail('a@harperdb.io.example.com')).toBe(false);
		expect(isStaffEmail('harperdb.io')).toBe(false);
	});
});

describe('getStaffUser', () => {
	beforeEach(() => get.mockReset());

	it('reads one user by encoded id', async () => {
		get.mockResolvedValue({ data: user('usr/1', 'dave@harperdb.io') });

		expect(await getStaffUser('usr/1')).toEqual({
			id: 'usr/1',
			email: 'dave@harperdb.io',
			firstname: 'F',
			lastname: 'L',
		});
		expect(get).toHaveBeenCalledWith('/Admin/User/usr%2F1');
	});
});
