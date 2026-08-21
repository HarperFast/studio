import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { isDirectOperationsUrl } from '@/lib/urls/isDirectOperationsUrl';
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
 * Mints an operation token from an explicit username/password, sent DIRECTLY to a Harper instance's
 * operations endpoint with `fetch` — never through the Fabric Connect proxy. The direct-URL check is
 * enforced here, not just at the call site, so no future caller can regress the boundary and POST
 * credentials to a proxy path. `credentials` is omitted so no ambient session cookie rides along, and
 * neither the body nor the token is logged.
 */
export async function mintOperationTokenWithCredentials(
	{ operationsUrl, username, password }: { operationsUrl: string; username: string; password: string },
): Promise<string> {
	if (!isDirectOperationsUrl(operationsUrl)) {
		throw new Error('Refusing to send credentials to a non-direct operations URL.');
	}
	// Bound the request so an unreachable instance can't hang the log-in indefinitely.
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 30_000);
	let response: Response;
	let data: { operation_token?: string; error?: string; message?: string } | undefined;
	try {
		response = await fetch(operationsUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'omit',
			// Fail on a redirect rather than replaying the credential-bearing POST to an unchecked origin.
			redirect: 'error',
			signal: controller.signal,
			body: JSON.stringify({ operation: 'create_authentication_tokens', username, password }),
		});
		// Body consumption stays inside the timer: an instance that sends headers and then stalls the body
		// would otherwise leave the log-in pending forever. A non-JSON body is tolerated (handled below),
		// but an abort must propagate rather than read as "no token returned".
		data = (await response.json().catch((error: unknown) => {
			if (controller.signal.aborted) {
				throw error;
			}
			return undefined;
		})) as typeof data;
	} catch (error) {
		// Replace the browser's opaque abort/network text with something the log-in form can explain.
		throw new Error(
			controller.signal.aborted
				? 'The instance did not respond within 30 seconds.'
				: `Could not reach the instance to log in. ${error instanceof Error ? error.message : ''}`.trim(),
		);
	} finally {
		clearTimeout(timeout);
	}
	if (!response.ok) {
		throw new Error(
			data?.error || data?.message
				|| (response.status === 401 || response.status === 403
					? 'Those credentials were not accepted by this instance.'
					: `The instance returned ${response.status} ${response.statusText}`.trim()),
		);
	}
	if (!data?.operation_token) {
		throw new Error(data?.error || data?.message || 'The instance did not return an operation token.');
	}
	return data.operation_token;
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
