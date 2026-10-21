import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { roleRefusalMessage } from './MintStaffApiTokenForm';

function axiosFailure(status: number, body: unknown): AxiosError {
	const config = { headers: new AxiosHeaders() };
	return new AxiosError('Request failed', String(status), config, undefined, {
		status,
		statusText: '',
		headers: {},
		config,
		data: body,
	});
}

describe('roleRefusalMessage', () => {
	// The one 403 the admin can act on from the form: it names the owner's role, which nothing else
	// in the API tells them.
	it('returns the server message for a role wider than the owner holds', () => {
		const message = "A fabric_support token would exceed the owner's fabric_readonly role";
		expect(roleRefusalMessage(axiosFailure(403, { code: 'Forbidden', title: message }))).toBe(message);
		expect(roleRefusalMessage(axiosFailure(403, message))).toBe(message);
	});

	it('leaves every other failure to the toast', () => {
		expect(roleRefusalMessage(axiosFailure(403, { title: 'API tokens can only be created from a Google SSO session' })))
			.toBeNull();
		expect(roleRefusalMessage(axiosFailure(409, { title: 'Limit of 3 live API tokens per owner reached' }))).toBeNull();
		expect(roleRefusalMessage(new Error("would exceed the owner's role"))).toBeNull();
	});
});
