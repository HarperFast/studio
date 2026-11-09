import { apiClient } from '@/config/apiClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHosts, getHostsQueryOptions, hostsQueryString } from './getHosts';

vi.mock('@/config/apiClient', () => ({ apiClient: { get: vi.fn() } }));

const mockedGet = vi.mocked(apiClient.get);

beforeEach(() => mockedGet.mockReset());

describe('hostsQueryString', () => {
	it('always sends the status, so the default RUNNING view is explicit', () => {
		expect(hostsQueryString({ status: 'RUNNING' })).toBe('status=RUNNING');
		expect(hostsQueryString({ status: 'all' })).toBe('status=all');
	});

	it('adds each filter that is set', () => {
		const query = new URLSearchParams(
			hostsQueryString({
				status: 'DEGRADED',
				organizationId: 'org-1',
				cloudProvider: 'gcp',
				locationId: 'gcp-us-east1',
				region: 'US-SE',
			}),
		);
		expect(Object.fromEntries(query)).toEqual({
			status: 'DEGRADED',
			organizationId: 'org-1',
			cloudProvider: 'gcp',
			locationId: 'gcp-us-east1',
			region: 'US-SE',
		});
	});

	// The endpoint 400s a blank filter, so an unset or emptied one must not be sent at all.
	it('sends running + degraded as one comma list', () => {
		expect(new URLSearchParams(hostsQueryString({ status: 'RUNNING,DEGRADED' })).get('status')).toBe(
			'RUNNING,DEGRADED',
		);
	});

	it('leaves out unset and empty filters', () => {
		expect(hostsQueryString({ status: 'RUNNING', organizationId: '', locationId: undefined })).toBe('status=RUNNING');
	});

	it('encodes values', () => {
		expect(hostsQueryString({ status: 'RUNNING', organizationId: 'a&b' })).toBe('status=RUNNING&organizationId=a%26b');
	});
});

describe('getHosts', () => {
	it('reads the collection route with the filters', async () => {
		mockedGet.mockResolvedValueOnce({ data: [{ id: 'h-1' }] } as never);
		expect(await getHosts({ status: 'all', cloudProvider: 'linode' })).toEqual([{ id: 'h-1' }]);
		expect(mockedGet).toHaveBeenCalledWith('/Admin/Host/?status=all&cloudProvider=linode');
	});

	it('keys the query on the filters', () => {
		expect(getHostsQueryOptions({ status: 'RUNNING' }).queryKey).not.toEqual(
			getHostsQueryOptions({ status: 'all' }).queryKey,
		);
	});
});
