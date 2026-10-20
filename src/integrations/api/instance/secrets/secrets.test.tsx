/**
 * @vitest-environment jsdom
 */
import { EntityIds } from '@/features/auth/store/authStore';
import { isUnansweredWrite } from '@/integrations/api/unansweredWrite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { webcrypto } from 'node:crypto';
import { PropsWithChildren } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
	SecretsOperationError,
	secretsPublicKeyQueryOptions,
	useDeleteSecret,
	useGrantSecret,
	useRevokeSecret,
	useSetSecret,
} from './secrets';

/*
 Exercises the hdb_secret client flow against a mocked operations client and a REAL RSA keypair:
 set_secret must carry an `enc:v1:` envelope whose sealed kid matches the served fingerprint (the
 plaintext never appears in the request), and a kid-mismatch rejection (custody key rotated under
 our cached copy) must refetch the key and re-encrypt exactly once.
 */

// Managed clusters fetch the public key from central-manager's apiClient; keep the real module
// (and its env expectations) out of the test.
const { cmPost } = vi.hoisted(() => ({ cmPost: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { post: cmPost } }));

// jsdom has no SubtleCrypto; Node's WebCrypto implements the same interface.
beforeAll(() => {
	if (!globalThis.crypto?.subtle) {
		Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
	}
});

afterEach(() => vi.clearAllMocks());

async function generateKey() {
	const keyPair = await webcrypto.subtle.generateKey(
		{ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
		true,
		['encrypt', 'decrypt'],
	);
	const der = new Uint8Array(await webcrypto.subtle.exportKey('spki', keyPair.publicKey));
	const b64 = btoa(String.fromCharCode(...der));
	const pem = `-----BEGIN PUBLIC KEY-----\n${b64.replace(/(.{64})/g, '$1\n')}\n-----END PUBLIC KEY-----\n`;
	const fingerprintBytes = new Uint8Array(await webcrypto.subtle.digest('SHA-256', der));
	const fingerprint = Array.from(fingerprintBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
	return { pem, fingerprint };
}

function decodeEnvelope(envelope: string): { kid: string } {
	expect(envelope.startsWith('enc:v1:')).toBe(true);
	const b64 = envelope.slice('enc:v1:'.length).replace(/-/g, '+').replace(/_/g, '/');
	return JSON.parse(atob(b64));
}

function harness() {
	const post = vi.fn();
	const instanceClient = { post } as unknown as AxiosInstance;
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const wrapper = ({ children }: PropsWithChildren) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	const params = { instanceClient, entityId: 'test-cluster' as EntityIds };
	return { post, queryClient, wrapper, params };
}

/** Datadog reads the `name`, so match it as well as the class: dropping the assignment keeps `instanceof`. */
async function expectSecretsOperationError(pending: Promise<unknown>, message: string) {
	const error = await pending.then(() => undefined, (rejection: unknown) => rejection);
	expect(error).toBeInstanceOf(SecretsOperationError);
	expect(error).toMatchObject({ name: 'SecretsOperationError', message });
}

function networkError() {
	return Object.assign(new Error('Network Error'), { name: 'AxiosError', code: 'ERR_NETWORK' });
}

describe('useSetSecret', () => {
	it('encrypts client-side and posts an envelope sealed with the served key', async () => {
		const { post, wrapper, params } = harness();
		const key = await generateKey();
		post.mockImplementation((_url: string, body: { operation: string }) => {
			if (body.operation === 'get_secrets_public_key') {
				return Promise.resolve({ data: { public_key: key.pem, fingerprint: key.fingerprint } });
			}
			if (body.operation === 'set_secret') {
				return Promise.resolve({ data: { name: 'API_KEY', kid: key.fingerprint, created: true } });
			}
			return Promise.reject(new Error(`Unexpected operation ${body.operation}`));
		});

		const { result } = renderHook(() => useSetSecret(), { wrapper });
		const response = await result.current.mutateAsync({ ...params, name: 'API_KEY', value: 'hunter2' });

		expect(response.created).toBe(true);
		const setCalls = post.mock.calls.filter(([, body]) => body.operation === 'set_secret');
		expect(setCalls).toHaveLength(1);
		const [, setBody] = setCalls[0];
		expect(setBody.name).toBe('API_KEY');
		expect(setBody.value).toBeUndefined(); // plaintext never leaves the browser
		expect(JSON.stringify(setBody)).not.toContain('hunter2');
		expect(decodeEnvelope(setBody.envelope).kid).toBe(key.fingerprint);
	});

	it('refetches the public key and re-encrypts once on a kid mismatch (key rotation)', async () => {
		const { post, wrapper, params } = harness();
		const staleKey = await generateKey();
		const activeKey = await generateKey();
		let servedKey = staleKey;
		post.mockImplementation((_url: string, body: { operation: string; envelope?: string }) => {
			if (body.operation === 'get_secrets_public_key') {
				return Promise.resolve({ data: { public_key: servedKey.pem, fingerprint: servedKey.fingerprint } });
			}
			if (body.operation === 'set_secret') {
				const { kid } = decodeEnvelope(body.envelope!);
				if (kid !== activeKey.fingerprint) {
					// The moment the stale envelope is rejected, the node serves the rotated key.
					servedKey = activeKey;
					return Promise.reject({
						response: {
							data: { error: `Secret envelope kid '${kid}' does not match this cluster's secrets key` },
						},
					});
				}
				return Promise.resolve({ data: { name: 'API_KEY', kid, created: false } });
			}
			return Promise.reject(new Error(`Unexpected operation ${body.operation}`));
		});

		const { result } = renderHook(() => useSetSecret(), { wrapper });
		const response = await result.current.mutateAsync({ ...params, name: 'API_KEY', value: 'rotated' });

		expect(response.kid).toBe(activeKey.fingerprint);
		const setCalls = post.mock.calls.filter(([, body]) => body.operation === 'set_secret');
		expect(setCalls).toHaveLength(2); // stale attempt + one re-encrypted retry
		expect(decodeEnvelope(setCalls[1][1].envelope).kid).toBe(activeKey.fingerprint);
	});

	it('surfaces the operation error message (not Axios noise) when the retry also fails', async () => {
		const { post, wrapper, params } = harness();
		const key = await generateKey();
		post.mockImplementation((_url: string, body: { operation: string }) => {
			if (body.operation === 'get_secrets_public_key') {
				return Promise.resolve({ data: { public_key: key.pem, fingerprint: key.fingerprint } });
			}
			return Promise.reject({ response: { data: { error: 'secrets custody is not initialized on this node' } } });
		});

		const { result } = renderHook(() => useSetSecret(), { wrapper });
		await expectSecretsOperationError(
			result.current.mutateAsync({ ...params, name: 'API_KEY', value: 'x' }),
			'secrets custody is not initialized on this node',
		);
	});

	it('leaves a failure Harper did not explain as it was thrown', async () => {
		const { post, wrapper, params } = harness();
		const key = await generateKey();
		const failure = networkError();
		post.mockImplementation((_url: string, body: { operation: string }) =>
			body.operation === 'get_secrets_public_key'
				? Promise.resolve({ data: { public_key: key.pem, fingerprint: key.fingerprint } })
				: Promise.reject(failure)
		);

		const { result } = renderHook(() => useSetSecret(), { wrapper });
		await expect(result.current.mutateAsync({ ...params, name: 'API_KEY', value: 'x' })).rejects.toBe(failure);
	});

	it('fetches the key from central-manager for managed clusters (central-manager#409)', async () => {
		const { post, wrapper, params } = harness();
		const key = await generateKey();
		cmPost.mockResolvedValue({
			data: { publicKey: key.pem, fingerprint: key.fingerprint, scheme: 'enc:v1', algorithm: 'RSA-OAEP-256' },
		});
		post.mockImplementation((_url: string, body: { operation: string }) =>
			body.operation === 'set_secret'
				? Promise.resolve({ data: { name: 'API_KEY', kid: key.fingerprint, created: true } })
				: Promise.reject(new Error(`Unexpected operation ${body.operation}`))
		);

		const { result } = renderHook(() => useSetSecret(), { wrapper });
		await result.current.mutateAsync({ ...params, managedClusterId: 'clu-123', name: 'API_KEY', value: 'v' });

		expect(cmPost).toHaveBeenCalledWith('/ClusterSecrets', {
			operation: 'get_secrets_public_key',
			clusterId: 'clu-123',
		});
		// The node op is never used for the key; the envelope targets CM's key; the write still
		// goes to the cluster itself.
		expect(post.mock.calls.filter(([, body]) => body.operation === 'get_secrets_public_key')).toHaveLength(0);
		const setCall = post.mock.calls.find(([, body]) => body.operation === 'set_secret');
		expect(decodeEnvelope(setCall![1].envelope).kid).toBe(key.fingerprint);
	});

	it('caches the public key between writes', async () => {
		const { post, wrapper, params, queryClient } = harness();
		const key = await generateKey();
		post.mockImplementation((_url: string, body: { operation: string }) => {
			if (body.operation === 'get_secrets_public_key') {
				return Promise.resolve({ data: { public_key: key.pem, fingerprint: key.fingerprint } });
			}
			return Promise.resolve({ data: { name: 'X', kid: key.fingerprint, created: true } });
		});

		const { result } = renderHook(() => useSetSecret(), { wrapper });
		await result.current.mutateAsync({ ...params, name: 'A', value: '1' });
		await result.current.mutateAsync({ ...params, name: 'B', value: '2' });

		const keyFetches = post.mock.calls.filter(([, body]) => body.operation === 'get_secrets_public_key');
		expect(keyFetches).toHaveLength(1);
		// And the cached entry is the one ensureQueryData used.
		await waitFor(() => expect(queryClient.getQueryData(secretsPublicKeyQueryOptions(params).queryKey)).toBeTruthy());
	});
});

describe('useDeleteSecret', () => {
	it('posts delete_secret and surfaces the body error message on failure', async () => {
		const { post, wrapper, params } = harness();
		post.mockResolvedValueOnce({ data: { message: "Successfully deleted secret 'API_KEY'" } });

		const { result } = renderHook(() => useDeleteSecret(), { wrapper });
		await result.current.mutateAsync({ ...params, name: 'API_KEY' });
		expect(post).toHaveBeenCalledWith('/', { operation: 'delete_secret', name: 'API_KEY' });

		post.mockRejectedValueOnce({ response: { data: { error: "No secret found with name 'NOPE'" } } });
		await expectSecretsOperationError(
			result.current.mutateAsync({ ...params, name: 'NOPE' }),
			"No secret found with name 'NOPE'",
		);

		const failure = networkError();
		post.mockRejectedValueOnce(failure);
		await expect(result.current.mutateAsync({ ...params, name: 'API_KEY' })).rejects.toBe(failure);
	});

	it('takes the string message when the error field is structured', async () => {
		const { post, wrapper, params } = harness();
		post.mockRejectedValueOnce({
			response: { data: { error: { code: 'NOT_FOUND' }, message: "No secret found with name 'NOPE'" } },
		});

		const { result } = renderHook(() => useDeleteSecret(), { wrapper });
		await expectSecretsOperationError(
			result.current.mutateAsync({ ...params, name: 'NOPE' }),
			"No secret found with name 'NOPE'",
		);
	});
});

describe.each(
	[
		['useGrantSecret', useGrantSecret, 'grant_secret'],
		['useRevokeSecret', useRevokeSecret, 'revoke_secret'],
	] as const,
)('%s', (_hook, useHook, operation) => {
	it(`posts ${operation} and surfaces the body error message on failure`, async () => {
		const { post, wrapper, params } = harness();
		post.mockResolvedValueOnce({ data: { name: 'API_KEY', grants: ['app'], changed: true } });

		const { result } = renderHook(() => useHook(), { wrapper });
		await result.current.mutateAsync({ ...params, name: 'API_KEY', component: 'app' });
		expect(post).toHaveBeenCalledWith('/', { operation, name: 'API_KEY', component: 'app' });

		post.mockRejectedValueOnce({ response: { data: { error: "No secret found with name 'NOPE'" } } });
		await expectSecretsOperationError(
			result.current.mutateAsync({ ...params, name: 'NOPE', component: 'app' }),
			"No secret found with name 'NOPE'",
		);

		const failure = networkError();
		post.mockRejectedValueOnce(failure);
		await expect(result.current.mutateAsync({ ...params, name: 'API_KEY', component: 'app' })).rejects.toBe(failure);
	});
});

describe('a secrets write that got no verdict', () => {
	function unanswered(body: { operation: string }) {
		const config = { method: 'post', data: JSON.stringify(body) } as InternalAxiosRequestConfig;
		return new AxiosError('timeout of 60000ms exceeded', AxiosError.ECONNABORTED, config);
	}

	it('rejects with the AxiosError itself, so its failure can say the outcome is unknown', async () => {
		const { post, wrapper, params } = harness();
		const key = await generateKey();
		post.mockImplementation((_url: string, body: { operation: string }) => {
			if (body.operation === 'get_secrets_public_key') {
				return Promise.resolve({ data: { public_key: key.pem, fingerprint: key.fingerprint } });
			}
			return Promise.reject(unanswered(body));
		});

		const set = renderHook(() => useSetSecret(), { wrapper }).result;
		const remove = renderHook(() => useDeleteSecret(), { wrapper }).result;
		const grant = renderHook(() => useGrantSecret(), { wrapper }).result;
		const failures = await Promise.all([
			set.current.mutateAsync({ ...params, name: 'API_KEY', value: 'x' }).catch((e: unknown) => e),
			remove.current.mutateAsync({ ...params, name: 'API_KEY' }).catch((e: unknown) => e),
			grant.current.mutateAsync({ ...params, name: 'API_KEY', component: 'app' }).catch((e: unknown) => e),
		]);

		for (const failure of failures) {
			expect(isUnansweredWrite(failure)).toBe(true);
		}
	});

	// Central manager's proxy answers a 504 with a JSON `error` after forwarding the operation, so the
	// body has the shape a Harper refusal has; the status, not the body, decides.
	it('keeps a gateway 504 that carries a JSON message as the AxiosError, not a SecretsOperationError', async () => {
		const { post, wrapper, params } = harness();
		const config = {
			method: 'post',
			data: JSON.stringify({ operation: 'delete_secret' }),
		} as InternalAxiosRequestConfig;
		const gateway = new AxiosError('Request failed with status code 504', AxiosError.ERR_BAD_RESPONSE, config, null, {
			status: 504,
			statusText: 'Gateway Timeout',
			headers: {},
			config,
			data: { error: 'Proxied operation timed out after 30s on instance ins-1' },
		});
		post.mockRejectedValueOnce(gateway);

		const { result } = renderHook(() => useDeleteSecret(), { wrapper });
		await expect(result.current.mutateAsync({ ...params, name: 'API_KEY' })).rejects.toBe(gateway);
	});
});
