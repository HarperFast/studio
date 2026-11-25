/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';

const recoverExpiredOperationToken = vi.fn();
const getConnectionGeneration = vi.fn();
vi.mock('@/features/auth/store/authStore', () => ({
	authStore: {
		recoverExpiredOperationToken: (...args: unknown[]) => recoverExpiredOperationToken(...args),
		getConnectionGeneration: (...args: unknown[]) => getConnectionGeneration(...args),
	},
}));

const { curryRecoverExpiredOperationToken, isDroppedTokenUserResponse, isExpiredTokenResponse } = await import(
	'./retryExpiredOperationToken'
);

function error401(config: Record<string, unknown> = { headers: {}, __connectionGeneration: 1 }) {
	return { response: { status: 401 }, config };
}

/** An operation token as Harper signs one: only the payload is read, so the signature is a placeholder. */
function operationToken(username: string): string {
	const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
	return [encode({ alg: 'RS256', typ: 'JWT' }), encode({ username, super_user: true, sub: 'operation' }), 'sig'].join(
		'.',
	);
}

/** Harper's 403 for a principal with no role (`verifyPerms`, `USER_HAS_NO_PERMS`), as the operations API sends it. */
function noRoleBody(username: string) {
	return {
		error: 'This operation is not authorized due to role restrictions and/or invalid database items',
		unauthorized_access: [`User ${username} has no role or permissions.  Please assign the user a valid role.`],
		invalid_schema_items: [],
	};
}

describe('curryRecoverExpiredOperationToken', () => {
	afterEach(() => vi.clearAllMocks());

	it('mints a fresh token and replays the request once', async () => {
		recoverExpiredOperationToken.mockResolvedValue('fresh-token');
		getConnectionGeneration.mockReturnValue(1);
		const request = vi.fn().mockResolvedValue({ data: 'ok' });
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');

		const result = await handler(error401());

		expect(result).toEqual({ data: 'ok' });
		expect(recoverExpiredOperationToken).toHaveBeenCalledWith('ins-1');
		expect(request).toHaveBeenCalledTimes(1);
		expect(request.mock.calls[0][0].__triedOperationTokenRefresh).toBe(true);
	});

	it('does not recover a request sent under a superseded connection', async () => {
		getConnectionGeneration.mockReturnValue(2);
		const request = vi.fn();
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');
		const err = error401({ headers: {}, __connectionGeneration: 1 });

		await expect(handler(err)).rejects.toBe(err);
		expect(recoverExpiredOperationToken).not.toHaveBeenCalled();
		expect(request).not.toHaveBeenCalled();
	});

	it('does not replay when the connection is replaced while recovery is in flight', async () => {
		getConnectionGeneration.mockReturnValueOnce(1).mockReturnValue(2);
		recoverExpiredOperationToken.mockResolvedValue('fresh-token');
		const request = vi.fn();
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');
		const err = error401();

		await expect(handler(err)).rejects.toBe(err);
		expect(recoverExpiredOperationToken).toHaveBeenCalledTimes(1);
		expect(request).not.toHaveBeenCalled();
	});

	it('rejects (no retry) when recovery yields no token', async () => {
		recoverExpiredOperationToken.mockResolvedValue(null);
		getConnectionGeneration.mockReturnValue(1);
		const request = vi.fn();
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');
		const err = error401();

		await expect(handler(err)).rejects.toBe(err);
		expect(request).not.toHaveBeenCalled();
	});

	it('does not recover a non-401 error', async () => {
		const request = vi.fn();
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');
		const err = { response: { status: 500 }, config: { headers: {} } };

		await expect(handler(err)).rejects.toBe(err);
		expect(recoverExpiredOperationToken).not.toHaveBeenCalled();
	});

	it('does not retry twice (guards against a loop when the fresh token is also rejected)', async () => {
		getConnectionGeneration.mockReturnValue(1);
		const request = vi.fn();
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');
		const err = error401({ headers: {}, __connectionGeneration: 1, __triedOperationTokenRefresh: true });

		await expect(handler(err)).rejects.toBe(err);
		expect(recoverExpiredOperationToken).not.toHaveBeenCalled();
		expect(request).not.toHaveBeenCalled();
	});
});

describe('isExpiredTokenResponse', () => {
	it('treats a 401 as expiry, as before', () => {
		expect(isExpiredTokenResponse({ status: 401 })).toBe(true);
	});

	it("recognizes Harper 5.3's 403 for an expired token, as text or problem details", () => {
		expect(isExpiredTokenResponse({ status: 403, data: 'token expired' })).toBe(true);
		expect(isExpiredTokenResponse({ status: 403, data: { title: 'token expired', status: 403 } })).toBe(true);
		expect(isExpiredTokenResponse({ status: 403, data: { error: 'token expired' } })).toBe(true);
	});

	it('leaves every other 403 alone: a fresh token would be refused the same way', () => {
		expect(isExpiredTokenResponse({ status: 403, data: { title: 'upstream token expired' } })).toBe(false);
		expect(isExpiredTokenResponse({ status: 403, data: 'the vendor token expired' })).toBe(false);
		expect(
			isExpiredTokenResponse({ status: 403, data: { title: 'Operation read_log is not in the operations allowlist' } }),
		)
			.toBe(false);
		expect(isExpiredTokenResponse({ status: 403 })).toBe(false);
		expect(isExpiredTokenResponse({ status: 500, data: 'token expired' })).toBe(false);
		expect(isExpiredTokenResponse(undefined)).toBe(false);
	});

	it('recovers and replays a request refused with an expired-token 403', async () => {
		recoverExpiredOperationToken.mockResolvedValue('fresh-token');
		getConnectionGeneration.mockReturnValue(1);
		const request = vi.fn().mockResolvedValue({ data: 'ok' });
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');

		const result = await handler({
			response: { status: 403, data: 'token expired' },
			config: { headers: {}, __connectionGeneration: 1 },
		});

		expect(result).toEqual({ data: 'ok' });
		expect(request).toHaveBeenCalledTimes(1);
	});
});

describe('isDroppedTokenUserResponse', () => {
	it("recognizes Harper's no-role 403 naming the token's own user", () => {
		expect(isDroppedTokenUserResponse({ status: 403, data: noRoleBody('HDB_ADMIN') }, operationToken('HDB_ADMIN')))
			.toBe(true);
	});

	it('reads a username that is not ASCII from the token as UTF-8', () => {
		expect(isDroppedTokenUserResponse({ status: 403, data: noRoleBody('zoë') }, operationToken('zoë'))).toBe(true);
	});

	it('leaves a no-role 403 that names anyone else alone', () => {
		expect(isDroppedTokenUserResponse({ status: 403, data: noRoleBody('someone-else') }, operationToken('HDB_ADMIN')))
			.toBe(false);
		expect(isDroppedTokenUserResponse({ status: 403, data: noRoleBody('HDB_ADMIN2') }, operationToken('HDB_ADMIN')))
			.toBe(false);
	});

	it('leaves a refusal for a user that has a role alone', () => {
		const error = noRoleBody('HDB_ADMIN').error;
		const refusals = [
			["Operation 'drop_user' is restricted to 'super_user' roles"],
			{ dev_dog: { schema: 'dev', table: 'dog', required_table_permissions: ['read'] } },
		];
		for (const unauthorized_access of refusals) {
			expect(
				isDroppedTokenUserResponse(
					{ status: 403, data: { error, unauthorized_access, invalid_schema_items: [] } },
					operationToken('HDB_ADMIN'),
				),
			)
				.toBe(false);
		}
	});

	it('needs the whole refusal, word for word, and nothing beside it', () => {
		const token = operationToken('HDB_ADMIN');
		const body = noRoleBody('HDB_ADMIN');
		const [refusal] = body.unauthorized_access;
		expect(isDroppedTokenUserResponse({ status: 403, data: { ...body, error: 'Forbidden' } }, token)).toBe(false);
		expect(isDroppedTokenUserResponse({ status: 403, data: { ...body, unauthorized_access: refusal } }, token)).toBe(
			false,
		);
		expect(
			isDroppedTokenUserResponse(
				{ status: 403, data: { ...body, unauthorized_access: [refusal, 'User other has no role'] } },
				token,
			),
		)
			.toBe(false);
		expect(
			isDroppedTokenUserResponse(
				{ status: 403, data: { ...body, unauthorized_access: [refusal.replace('.  ', '. ')] } },
				token,
			),
		)
			.toBe(false);
		expect(isDroppedTokenUserResponse({ status: 403, data: refusal }, token)).toBe(false);
	});

	it('needs a 403 and a token that names a user', () => {
		const body = noRoleBody('HDB_ADMIN');
		expect(isDroppedTokenUserResponse({ status: 401, data: body }, operationToken('HDB_ADMIN'))).toBe(false);
		expect(isDroppedTokenUserResponse({ status: 500, data: body }, operationToken('HDB_ADMIN'))).toBe(false);
		expect(isDroppedTokenUserResponse(undefined, operationToken('HDB_ADMIN'))).toBe(false);
		expect(isDroppedTokenUserResponse({ status: 403, data: body }, undefined)).toBe(false);
		expect(isDroppedTokenUserResponse({ status: 403, data: body }, 'opaque')).toBe(false);
		expect(isDroppedTokenUserResponse({ status: 403, data: body }, 'not.a-jwt.!!')).toBe(false);
	});
});

describe('curryRecoverExpiredOperationToken on a dropped user', () => {
	afterEach(() => vi.clearAllMocks());

	function refusedFor(tokenUser: string, namedUser: string, extra: Record<string, unknown> = {}) {
		return {
			response: { status: 403, data: noRoleBody(namedUser) },
			config: {
				headers: { Authorization: `Bearer ${operationToken(tokenUser)}` },
				__connectionGeneration: 1,
				...extra,
			},
		};
	}

	it('recovers and replays a request whose token names the user the 403 says has no role', async () => {
		recoverExpiredOperationToken.mockResolvedValue('fresh-token');
		getConnectionGeneration.mockReturnValue(1);
		const request = vi.fn().mockResolvedValue({ data: 'ok' });
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');

		await expect(handler(refusedFor('HDB_ADMIN', 'HDB_ADMIN'))).resolves.toEqual({ data: 'ok' });

		expect(recoverExpiredOperationToken).toHaveBeenCalledWith('ins-1');
		expect(request.mock.calls[0][0].__triedOperationTokenRefresh).toBe(true);
	});

	it('reads the Bearer through AxiosHeaders, as a real request carries it', async () => {
		recoverExpiredOperationToken.mockResolvedValue('fresh-token');
		getConnectionGeneration.mockReturnValue(1);
		const request = vi.fn().mockResolvedValue({ data: 'ok' });
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');
		const err = refusedFor('HDB_ADMIN', 'HDB_ADMIN');
		const { AxiosHeaders } = await import('axios');
		const headers = new AxiosHeaders();
		headers.set('authorization', err.config.headers.Authorization);

		await expect(handler({ ...err, config: { ...err.config, headers } })).resolves.toEqual({ data: 'ok' });
	});

	it('does not recover a no-role 403 that names another user', async () => {
		getConnectionGeneration.mockReturnValue(1);
		const request = vi.fn();
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');
		const err = refusedFor('HDB_ADMIN', 'someone-else');

		await expect(handler(err)).rejects.toBe(err);
		expect(recoverExpiredOperationToken).not.toHaveBeenCalled();
		expect(request).not.toHaveBeenCalled();
	});

	it('surfaces the same 403 on the replay rather than re-minting again', async () => {
		getConnectionGeneration.mockReturnValue(1);
		const request = vi.fn();
		const handler = curryRecoverExpiredOperationToken({ request }, 'ins-1');
		const err = refusedFor('HDB_ADMIN', 'HDB_ADMIN', { __triedOperationTokenRefresh: true });

		await expect(handler(err)).rejects.toBe(err);
		expect(recoverExpiredOperationToken).not.toHaveBeenCalled();
		expect(request).not.toHaveBeenCalled();
	});
});
