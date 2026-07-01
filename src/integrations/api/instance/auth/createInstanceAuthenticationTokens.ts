import { InstanceClientConfig } from '@/config/instanceClientConfig';
import type { AxiosRequestConfig } from 'axios';

export interface InstanceAuthenticationTokens {
	/** Short-lived JWT (Harper default ~1 day) used as the direct-connect Bearer token. */
	operationToken: string;
	/** Longer-lived JWT (Harper default ~30 days) used to mint a fresh operation token without the proxy. */
	refreshToken?: string;
}

/**
 * Mints a Harper operation token + refresh token for the user the request authenticates as. This is
 * the same operation `harper login` uses. We send it through the Fabric Connect proxy (which is
 * already authenticated as the instance user on the caller's behalf) so we can obtain tokens without
 * ever holding the instance's username/password, then use the operation token to talk to the instance
 * directly and the refresh token to renew it when it expires.
 */
export async function createInstanceAuthenticationTokens(
	{ instanceClient, ...config }: InstanceClientConfig & AxiosRequestConfig,
): Promise<InstanceAuthenticationTokens> {
	const { data } = await instanceClient.post('/', {
		operation: 'create_authentication_tokens',
	}, config);
	const { operation_token: operationToken, refresh_token: refreshToken } =
		(data as { operation_token?: string; refresh_token?: string } | undefined) ?? {};
	if (!operationToken) {
		throw new Error('Fabric Connect did not return an operation token');
	}
	return { operationToken, refreshToken };
}

/**
 * Exchanges a refresh token for a fresh operation token via Harper's `refresh_operation_token`
 * operation, sent DIRECTLY to the instance (the refresh token is the Bearer credential). This renews
 * an expired operation token without a proxy round-trip. Harper returns only a new operation token —
 * the refresh token is unchanged.
 */
export async function refreshInstanceOperationToken(
	{ instanceClient, refreshToken, ...config }: InstanceClientConfig & { refreshToken: string } & AxiosRequestConfig,
): Promise<string> {
	const { data } = await instanceClient.post('/', {
		operation: 'refresh_operation_token',
	}, {
		...config,
		headers: { ...config.headers, Authorization: `Bearer ${refreshToken}` },
	});
	const operationToken = (data as { operation_token?: string } | undefined)?.operation_token;
	if (!operationToken) {
		throw new Error('Harper did not return a refreshed operation token');
	}
	return operationToken;
}
