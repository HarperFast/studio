import { apiClient } from '@/config/apiClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatOrgLabel, getOrganizations, ORGANIZATION_PAGE_LIMIT, ORGANIZATION_PAGE_SIZE } from './getOrganizations';

vi.mock('@/config/apiClient', () => ({ apiClient: { get: vi.fn() } }));

const mockedGet = vi.mocked(apiClient.get);

beforeEach(() => mockedGet.mockReset());

/** `count` stub org rows, numbered from `from` so pages are distinguishable. */
function orgPage(from: number, count: number) {
	return {
		data: Array.from({ length: count }, (_, i) => ({ id: `org-${from + i}`, name: `Org ${from + i}` })),
	};
}

function requestedRanges() {
	return mockedGet.mock.calls.map(([url]) => /limit\((\d+),(\d+)\)/.exec(url as string)!.slice(1).join('-'));
}

describe('getOrganizations', () => {
	it('stops after one request when the first page is short', async () => {
		mockedGet.mockResolvedValueOnce(orgPage(0, 3) as never);

		const { organizations, truncated } = await getOrganizations();

		expect(organizations).toHaveLength(3);
		expect(truncated).toBe(false);
		expect(mockedGet).toHaveBeenCalledTimes(1);
	});

	// The picker and the list page's id→name map both need every org, so a full page can't be the end
	// of the sweep — Harper collections return no total count, only the rows.
	it('keeps paging past a full page, with non-overlapping ranges', async () => {
		mockedGet
			.mockResolvedValueOnce(orgPage(0, ORGANIZATION_PAGE_SIZE) as never)
			.mockResolvedValueOnce(orgPage(ORGANIZATION_PAGE_SIZE, 2) as never);

		const { organizations, truncated } = await getOrganizations();

		expect(organizations).toHaveLength(ORGANIZATION_PAGE_SIZE + 2);
		expect(truncated).toBe(false);
		expect(requestedRanges()).toEqual([
			`0-${ORGANIZATION_PAGE_SIZE}`,
			`${ORGANIZATION_PAGE_SIZE}-${ORGANIZATION_PAGE_SIZE * 2}`,
		]);
		// No org appears twice, so the second page really started where the first ended.
		expect(new Set(organizations.map((o) => o.id)).size).toBe(organizations.length);
	});

	it('reports truncated instead of spinning when every page comes back full', async () => {
		mockedGet.mockResolvedValue(orgPage(0, ORGANIZATION_PAGE_SIZE) as never);

		const { truncated } = await getOrganizations();

		expect(truncated).toBe(true);
		expect(mockedGet).toHaveBeenCalledTimes(ORGANIZATION_PAGE_LIMIT);
	});

	it('excludes terminated orgs and sorts by name', async () => {
		mockedGet.mockResolvedValueOnce(orgPage(0, 1) as never);

		await getOrganizations();

		expect(mockedGet.mock.calls[0][0]).toContain('status=ne=DELETED');
		expect(mockedGet.mock.calls[0][0]).toContain('sort(name)');
		// Without the trailing slash Harper returns the collection descriptor, not the rows.
		expect(mockedGet.mock.calls[0][0]).toContain('/Admin/Organization/?');
	});
});

describe('formatOrgLabel', () => {
	it('shows the id alone when the name is unknown', () => {
		expect(formatOrgLabel('org-1', 'Acme')).toBe('org-1 (Acme)');
		expect(formatOrgLabel('org-1')).toBe('org-1');
	});
});
