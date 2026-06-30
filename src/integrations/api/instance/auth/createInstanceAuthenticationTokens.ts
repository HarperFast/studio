import { InstanceClientConfig } from '@/config/instanceClientConfig';
import type { AxiosRequestConfig } from 'axios';

/**
 * Mints a Harper operation token (a JWT) for the user the request authenticates as. This is the
 * same operation `harper login` uses. We send it through the Fabric Connect proxy (which is already
 * authenticated as the instance user on the caller's behalf) so we can obtain a token without ever
 * holding the instance's username/password, then use that token to talk to the instance directly.
 *
 * @returns the `operation_token` JWT.
 */
export async function createInstanceAuthenticationTokens(
	{ instanceClient, ...config }: InstanceClientConfig & AxiosRequestConfig,
): Promise<string> {
	const { data } = await instanceClient.post('/', {
		operation: 'create_authentication_tokens',
	}, config);
	const token = (data as { operation_token?: string } | undefined)?.operation_token;
	if (!token) {
		throw new Error('Fabric Connect did not return an operation token');
	}
	return token;
}
