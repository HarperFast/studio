/**
 * Cluster secrets — the replicated `system.hdb_secret` store (harper#1554; key custody in
 * harper-pro#512, tracked by harper-pro#166).
 *
 * Secrets are named, envelope-encrypted rows on the cluster itself, managed through the ordinary
 * per-instance operations API. Values are encrypted **in the browser** (`enc:v1` envelope against
 * the cluster secrets public key) before they leave, so plaintext never reaches the operations
 * API, the operation log, or disk — and can never be read back. Rows replicate to every node via
 * normal system-table replication; at load time core materializes a secret only into components
 * listed in its `grants`.
 *
 * Without a registered key custody provider (the Pro secretCustody component), the node has no
 * public key — `get_secrets_public_key` fails with a clean error and nothing can be encrypted.
 * `list_secrets` still works, so the store is browsable read-only in that state.
 */
import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { encryptEnvelope } from '@/lib/crypto/envSecret';
import { QueryClient, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

/** `get_secrets_public_key` — the cluster key clients encrypt against. */
export interface SecretsPublicKey {
	public_key: string;
	fingerprint: string;
}

/** One `list_secrets` row: metadata only — never envelopes, never values. */
export interface SecretMetadata {
	name: string;
	/** Fingerprint of the key the stored envelope was encrypted under (null for kid-less rows). */
	kid: string | null;
	/** Component names allowed to receive this secret at load time. */
	grants: string[];
	metadata: Record<string, unknown>;
	/** Stored without key-identity verification (kid-less envelope, or no custody at write time). */
	unverified: boolean;
	updated_by: string | null;
	__createdtime__: number;
	__updatedtime__: number;
	/** False when the row was encrypted under a different key than the node's current one. */
	kid_matches_custody: boolean;
}

export interface ListSecretsResponse {
	secrets: SecretMetadata[];
	/** The node's current custody key fingerprint; null when no custody is registered. */
	custody_fingerprint: string | null;
}

/** Operations API errors carry the message in the response body; surface that, not the Axios noise. */
function operationErrorMessage(error: unknown): string {
	const body = (error as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
	return body?.error ?? body?.message ?? String(error);
}

async function getSecretsPublicKey({ instanceClient }: InstanceClientIdConfig): Promise<SecretsPublicKey> {
	const { data } = await instanceClient.post<SecretsPublicKey>('/', { operation: 'get_secrets_public_key' });
	return data;
}

export function secretsPublicKeyQueryOptions(params: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [params.entityId, 'get_secrets_public_key'] as const,
		queryFn: () => getSecretsPublicKey(params),
		// The custody key can rotate (kid map), so refresh periodically instead of caching forever.
		// Failure is a state, not a blip: without custody the node simply has no key.
		staleTime: 5 * 60_000,
		retry: false,
	});
}

async function listSecrets({ instanceClient }: InstanceClientIdConfig): Promise<ListSecretsResponse> {
	const { data } = await instanceClient.post<ListSecretsResponse>('/', { operation: 'list_secrets' });
	return data;
}

export function listSecretsQueryOptions(params: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [params.entityId, 'list_secrets'] as const,
		queryFn: () => listSecrets(params),
	});
}

export interface SetSecretArgs extends InstanceClientIdConfig {
	name: string;
	value: string;
}

async function encryptAndSetSecret(queryClient: QueryClient, args: SetSecretArgs, isRetry: boolean): Promise<{
	name: string;
	kid: string | null;
	created: boolean;
}> {
	// Encrypt against the cluster public key so the plaintext value never leaves the browser. The
	// envelope's sealed kid tells the cluster which key it was encrypted under.
	const { public_key, fingerprint } = await queryClient.ensureQueryData(secretsPublicKeyQueryOptions(args));
	const envelope = await encryptEnvelope(args.value, public_key, fingerprint);
	try {
		const { data } = await args.instanceClient.post('/', {
			operation: 'set_secret',
			name: args.name,
			envelope,
		});
		return data;
	} catch (error) {
		const message = operationErrorMessage(error);
		// A kid mismatch means our cached public key is stale (the custody key rotated). Drop the
		// cached key (ensureQueryData returns stale entries, so invalidation isn't enough) and
		// re-encrypt once; anything else (or a second mismatch) surfaces to the caller.
		if (!isRetry && message.includes('does not match')) {
			queryClient.removeQueries({ queryKey: secretsPublicKeyQueryOptions(args).queryKey });
			return encryptAndSetSecret(queryClient, args, true);
		}
		throw new Error(message);
	}
}

export function useSetSecret() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (args: SetSecretArgs) => encryptAndSetSecret(queryClient, args, false),
	});
}

export interface DeleteSecretArgs extends InstanceClientIdConfig {
	name: string;
}

async function deleteSecret({ instanceClient, name }: DeleteSecretArgs): Promise<{ message: string }> {
	try {
		const { data } = await instanceClient.post('/', { operation: 'delete_secret', name });
		return data;
	} catch (error) {
		throw new Error(operationErrorMessage(error));
	}
}

export function useDeleteSecret() {
	return useMutation({ mutationFn: deleteSecret });
}

export interface GrantSecretArgs extends InstanceClientIdConfig {
	name: string;
	component: string;
}

export interface GrantSecretResponse {
	name: string;
	grants: string[];
	changed: boolean;
}

async function mutateGrant(
	operation: 'grant_secret' | 'revoke_secret',
	{ instanceClient, name, component }: GrantSecretArgs,
): Promise<GrantSecretResponse> {
	try {
		const { data } = await instanceClient.post<GrantSecretResponse>('/', { operation, name, component });
		return data;
	} catch (error) {
		throw new Error(operationErrorMessage(error));
	}
}

export function useGrantSecret() {
	return useMutation({ mutationFn: (args: GrantSecretArgs) => mutateGrant('grant_secret', args) });
}

export function useRevokeSecret() {
	return useMutation({ mutationFn: (args: GrantSecretArgs) => mutateGrant('revoke_secret', args) });
}
