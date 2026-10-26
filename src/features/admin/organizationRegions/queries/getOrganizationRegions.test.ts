import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOrganizationRegions } from './getOrganizationRegions';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/config/apiClient', () => ({ apiClient: { get } }));

afterEach(() => get.mockReset());

const httpError = (status: number) =>
	new AxiosError('failed', String(status), undefined, undefined, {
		status,
		statusText: '',
		headers: {},
		config: { headers: new AxiosHeaders() },
		data: {},
	});

describe('getOrganizationRegions', () => {
	it("returns the organization's rows", async () => {
		get.mockResolvedValue({ data: [{ id: 'oreg-1' }] });
		await expect(getOrganizationRegions('org-1')).resolves.toEqual([{ id: 'oreg-1' }]);
		expect(get).toHaveBeenCalledWith('/OrganizationRegion/?organizationId=org-1');
	});

	it('returns null when the central manager has no custom regions (404)', async () => {
		get.mockRejectedValue(httpError(404));
		await expect(getOrganizationRegions('org-1')).resolves.toBeNull();
	});

	it('rethrows any other failure', async () => {
		get.mockRejectedValue(httpError(500));
		await expect(getOrganizationRegions('org-1')).rejects.toThrow('failed');
	});
});
