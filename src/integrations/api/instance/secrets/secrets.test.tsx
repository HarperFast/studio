/**
 * @vitest-environment jsdom
 */
import { EntityIds } from '@/features/auth/store/authStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { AxiosInstance } from 'axios';
import { webcrypto } from 'node:crypto';
import { PropsWithChildren } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { secretsPublicKeyQueryOptions, useDeleteSecret, useSetSecret } from './secrets';

/*
 Exercises the hdb_secret client flow against a mocked operations client and a REAL RSA keypair:
 set_secret must carry an `enc:v1:` envelope whose sealed kid matches the served fingerprint (the
 plaintext never appears in the request), and a kid-mismatch rejection (custody key rotated under
 our cached copy) must refetch the key and re-encrypt exactly once.
 */

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
		await expect(result.current.mutateAsync({ ...params, name: 'API_KEY', value: 'x' })).rejects.toThrow(
			'secrets custody is not initialized on this node',
		);
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
		await expect(result.current.mutateAsync({ ...params, name: 'NOPE' })).rejects.toThrow(
			"No secret found with name 'NOPE'",
		);
	});
});
