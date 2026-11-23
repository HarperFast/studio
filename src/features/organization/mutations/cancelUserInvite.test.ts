import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { del } = vi.hoisted(() => ({ del: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { delete: del } }));

import { onCancelUserInvite } from './cancelUserInvite';

afterEach(() => {
	vi.clearAllMocks();
});

function httpError(status: number) {
	return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, {
		status,
		statusText: '',
		headers: {},
		config: { headers: new AxiosHeaders() },
		data: '',
	});
}

describe('onCancelUserInvite', () => {
	it('deletes the invitee by id, with no trailing slash and the id encoded', async () => {
		del.mockResolvedValue({ data: { deleted: true } });

		await expect(onCancelUserInvite({ userId: 'usr-1' })).resolves.toBe('cancelled');
		await onCancelUserInvite({ userId: 'a/b' });

		expect(del.mock.calls).toEqual([['/UserInvite/usr-1'], ['/UserInvite/a%2Fb']]);
	});

	it('resolves the two refusals the modal handles: 404 and 403', async () => {
		del.mockRejectedValueOnce(httpError(404));
		await expect(onCancelUserInvite({ userId: 'usr-1' })).resolves.toBe('not-pending');

		del.mockRejectedValueOnce(httpError(403));
		await expect(onCancelUserInvite({ userId: 'usr-1' })).resolves.toBe('forbidden');
	});

	it.each([401, 409, 500, 503])('rejects on %i so the shared mutation toast reports it', async (status) => {
		const error = httpError(status);
		del.mockRejectedValueOnce(error);

		await expect(onCancelUserInvite({ userId: 'usr-1' })).rejects.toBe(error);
	});

	it('rejects on a failure with no response', async () => {
		const error = new AxiosError('Network Error', 'ERR_NETWORK');
		del.mockRejectedValueOnce(error);

		await expect(onCancelUserInvite({ userId: 'usr-1' })).rejects.toBe(error);
	});
});
