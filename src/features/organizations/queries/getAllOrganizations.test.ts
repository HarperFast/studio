import { apiClient } from '@/config/apiClient';
import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ALL_ORGANIZATIONS_PAGE_SIZE,
	buildAllOrganizationsUrl,
	getAllOrganizationsQueryOptions,
	getOrganizationByIdPage,
	getOrganizationForClusterPage,
} from './getAllOrganizations';

vi.mock('@/config/apiClient', () => ({
	apiClient: {
		get: vi.fn(),
	},
}));

const mockedGet = vi.mocked(apiClient.get);

function notFound() {
	return new AxiosError('Not Found', 'ERR_BAD_REQUEST', undefined, undefined, {
		status: 404,
	} as AxiosResponse);
}

beforeEach(() => {
	mockedGet.mockReset();
});

afterEach(() => {
	vi.restoreAllMocks();
});

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

describe('getOrganizationByIdPage', () => {
	it('fetches the organization by its exact id and returns a one-item page', async () => {
		mockedGet.mockResolvedValue({ data: { id: 'org-1', name: 'Acme' } });

		const page = await getOrganizationByIdPage('org-1');

		expect(mockedGet).toHaveBeenCalledWith('/Admin/Organization/org-1');
		expect(page).toEqual({ organizations: [{ id: 'org-1', name: 'Acme' }], hasNextPage: false });
	});

	it('returns an empty page when the organization does not exist', async () => {
		mockedGet.mockRejectedValue(notFound());

		await expect(getOrganizationByIdPage('org-missing')).resolves.toEqual({ organizations: [], hasNextPage: false });
	});

	it('rethrows non-404 errors', async () => {
		mockedGet.mockRejectedValue(new Error('boom'));

		await expect(getOrganizationByIdPage('org-1')).rejects.toThrow('boom');
	});
});

describe('getOrganizationForClusterPage', () => {
	it('resolves the cluster to its owning organization', async () => {
		mockedGet
			.mockResolvedValueOnce({ data: { id: 'clu-1', organizationId: 'org-7' } })
			.mockResolvedValueOnce({ data: { id: 'org-7', name: 'Owner Org' } });

		const page = await getOrganizationForClusterPage('clu-1');

		expect(mockedGet).toHaveBeenNthCalledWith(1, '/Cluster/clu-1');
		expect(mockedGet).toHaveBeenNthCalledWith(2, '/Admin/Organization/org-7');
		expect(page).toEqual({ organizations: [{ id: 'org-7', name: 'Owner Org' }], hasNextPage: false });
	});

	it('returns an empty page when the cluster does not exist', async () => {
		mockedGet.mockRejectedValue(notFound());

		await expect(getOrganizationForClusterPage('clu-missing')).resolves.toEqual({
			organizations: [],
			hasNextPage: false,
		});
	});

	it('returns an empty page when the cluster has no owning organization', async () => {
		mockedGet.mockResolvedValue({ data: { id: 'clu-1' } });

		const page = await getOrganizationForClusterPage('clu-1');

		expect(mockedGet).toHaveBeenCalledTimes(1);
		expect(page).toEqual({ organizations: [], hasNextPage: false });
	});
});

describe('getAllOrganizationsQueryOptions', () => {
	it('looks an organization up by id when the search value is an org id', async () => {
		mockedGet.mockResolvedValue({ data: { id: 'org-1', name: 'Acme' } });

		await getAllOrganizationsQueryOptions(0, 'org-1').queryFn!({} as never);

		expect(mockedGet).toHaveBeenCalledWith('/Admin/Organization/org-1');
	});

	it('resolves an org via its cluster when the search value is a cluster id', async () => {
		mockedGet
			.mockResolvedValueOnce({ data: { id: 'clu-1', organizationId: 'org-7' } })
			.mockResolvedValueOnce({ data: { id: 'org-7', name: 'Owner Org' } });

		await getAllOrganizationsQueryOptions(0, 'clu-1').queryFn!({} as never);

		expect(mockedGet).toHaveBeenNthCalledWith(1, '/Cluster/clu-1');
		expect(mockedGet).toHaveBeenNthCalledWith(2, '/Admin/Organization/org-7');
	});

	it('runs a name search when the value is not an id', async () => {
		mockedGet.mockResolvedValue({ data: [] });

		await getAllOrganizationsQueryOptions(0, 'Acme').queryFn!({} as never);

		expect(mockedGet).toHaveBeenCalledWith(
			'/Admin/Organization/?name=ct=Acme&status=ne=DELETED&sort(name)&limit(0,13)',
		);
	});
});
