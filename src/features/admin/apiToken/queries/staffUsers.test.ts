import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get } }));

import {
	getStaffUser,
	isStaffEmail,
	searchStaffUsers,
	STAFF_USER_SEARCH_LIMIT,
	STAFF_USER_SEARCH_PAGE_LIMIT,
	STAFF_USER_SEARCH_PAGE_SIZE,
} from './staffUsers';

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
		expect(url).toContain(`limit(0,${STAFF_USER_SEARCH_PAGE_SIZE})`);
	});

	// The table holds customers under the same prefix and offers no suffix match, so one page of
	// customers must not read as "no staff member matches".
	it('reads past a page of customers to find the staff behind them', async () => {
		const customers = Array.from(
			{ length: STAFF_USER_SEARCH_PAGE_SIZE },
			(_, i) => user(`usr-c${i}`, `da${String(i).padStart(3, '0')}@example.com`),
		);
		get
			.mockResolvedValueOnce({ data: customers })
			.mockResolvedValueOnce({ data: [user('usr-dawn', 'dawn@harperdb.io')] });

		const found = await searchStaffUsers('da');

		expect(found.map((u) => u.id)).toEqual(['usr-dawn']);
		expect(get.mock.calls.map(([url]) => /limit\((\d+),(\d+)\)/.exec(url as string)![0])).toEqual([
			`limit(0,${STAFF_USER_SEARCH_PAGE_SIZE})`,
			`limit(${STAFF_USER_SEARCH_PAGE_SIZE},${STAFF_USER_SEARCH_PAGE_SIZE * 2})`,
		]);
	});

	it('stops at a short page, at enough staff, and at the page limit', async () => {
		get.mockResolvedValueOnce({ data: [user('usr-1', 'a@harperdb.io')] });
		expect(await searchStaffUsers('a')).toHaveLength(1);
		expect(get).toHaveBeenCalledTimes(1);

		get.mockReset();
		const staffPage = Array.from(
			{ length: STAFF_USER_SEARCH_PAGE_SIZE },
			(_, i) => user(`usr-${i}`, `s${i}@harperdb.io`),
		);
		get.mockResolvedValue({ data: staffPage });
		expect(await searchStaffUsers('s')).toHaveLength(STAFF_USER_SEARCH_LIMIT);
		expect(get).toHaveBeenCalledTimes(1);

		get.mockReset();
		const customerPage = Array.from(
			{ length: STAFF_USER_SEARCH_PAGE_SIZE },
			(_, i) => user(`usr-${i}`, `c${i}@example.com`),
		);
		get.mockResolvedValue({ data: customerPage });
		expect(await searchStaffUsers('c')).toEqual([]);
		expect(get).toHaveBeenCalledTimes(STAFF_USER_SEARCH_PAGE_LIMIT);
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

	// A label is not worth a toast or a RUM error per missing user; the id stands in.
	it('answers null instead of throwing when the lookup fails', async () => {
		// Once: a persistent rejecting implementation on a reset mock is reported as an unhandled
		// rejection by vitest 5 even though the call catches it.
		get.mockRejectedValueOnce(new Error('404'));

		expect(await getStaffUser('usr-gone')).toBeNull();
	});
});
