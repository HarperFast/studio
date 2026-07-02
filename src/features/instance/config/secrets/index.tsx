import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { SecretGrantsEditor } from '@/features/instance/config/secrets/SecretGrantsEditor';
import { SecretRow, SecretsManager } from '@/features/instance/secrets/SecretsManager';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import {
	listSecretsQueryOptions,
	SecretMetadata,
	secretsPublicKeyQueryOptions,
	useDeleteSecret,
	useSetSecret,
} from '@/integrations/api/instance/secrets/secrets';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { TriangleAlertIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';

/**
 * Cluster secrets (the replicated `system.hdb_secret` store, harper#1554 / harper-pro#166):
 * named, envelope-encrypted values managed through the instance operations API and scoped to
 * applications via grants. Values are encrypted in the browser and can never be read back.
 */
export function ConfigSecretsIndex() {
	const navigate = useNavigate();
	const { secretName, clusterId }: { secretName?: string; clusterId?: string } = useParams({ strict: false });
	const instanceParams = useInstanceClientIdParams();
	const { data, refetch, isFetching } = useQuery(listSecretsQueryOptions(instanceParams));

	// Fabric-managed clusters get their public key from central-manager (the custodian — it mints
	// the keypair on first use, central-manager#409); self-hosted/local nodes serve their own.
	const { data: cluster } = useQuery(getClusterInfoQueryOptions(clusterId, false));
	const isSelfManaged = cluster === undefined || clusterIsSelfManaged(cluster);
	const managedClusterId = !isSelfManaged ? clusterId : undefined;
	const keySource = useMemo(() => ({ ...instanceParams, managedClusterId }), [instanceParams, managedClusterId]);

	// Without a secrets key (no custody registered, or CM unreachable) nothing can be encrypted,
	// so the store is browsable read-only.
	const publicKeyQuery = useQuery(secretsPublicKeyQueryOptions(keySource));

	const secrets = data?.secrets;
	const rows = useMemo<SecretRow[]>(
		() => (secrets ?? []).map((secret) => ({ name: secret.name, warning: warningFor(secret, data) })),
		[secrets, data],
	);
	const selectedName = useMemo(() => secrets?.find((s) => s.name === secretName)?.name, [secrets, secretName]);

	const onSelectName = useCallback(
		(next: string | undefined) => {
			const parts = [secretName ? '..' : '', next].filter(Boolean);
			void navigate({ to: parts.join('/') });
		},
		[navigate, secretName],
	);

	const { mutateAsync: setSecret } = useSetSecret();
	const { mutateAsync: deleteSecret } = useDeleteSecret();

	const onSet = useCallback(async (name: string, value: string) => {
		await setSecret({ ...keySource, name, value });
		await refetch();
	}, [setSecret, keySource, refetch]);

	const onDelete = useCallback(async (name: string) => {
		await deleteSecret({ ...instanceParams, name });
		await refetch();
	}, [deleteSecret, instanceParams, refetch]);

	return (
		<>
			{publicKeyQuery.isError && (
				<p className="flex items-start gap-2 text-sm text-muted-foreground border border-amber-500/50 rounded-md p-3 mb-4">
					<TriangleAlertIcon className="size-4 text-amber-500 shrink-0 mt-0.5" />
					<span>
						Secrets are read-only right now: this cluster has no secrets key, so values can't be encrypted. Key custody
						is provided by the Harper secret-custody component — once it's active, refresh this page.
					</span>
				</p>
			)}
			<SecretsManager
				rows={rows}
				isFetching={isFetching}
				onRefresh={refetch}
				canManage={publicKeyQuery.isSuccess}
				selectedName={selectedName}
				onSelectName={onSelectName}
				nameHeader="Secret"
				addDescription="The value is encrypted in your browser against the cluster's secrets key — plaintext never reaches the API, the operation log, or disk. It can be replaced or deleted, but never read back."
				editDescription="The current value can't be shown — it's stored encrypted. Enter a new value to replace it, adjust which applications receive it, or delete the secret."
				valueDescription="Encrypted client-side before it leaves this page."
				onSet={onSet}
				onDelete={onDelete}
				renderEditExtras={(name) => {
					const secret = secrets?.find((s) => s.name === name);
					return (
						secret && (
							<SecretGrantsEditor
								key={secret.name}
								name={secret.name}
								initialGrants={secret.grants}
								onChanged={() => void refetch()}
							/>
						)
					);
				}}
			/>
		</>
	);
}

/** A per-row caution for stored secrets that may not decrypt at load time. */
function warningFor(secret: SecretMetadata, data: { custody_fingerprint: string | null } | undefined) {
	// Without custody there is no key identity to compare against — every row would "mismatch".
	if (!data?.custody_fingerprint) {
		return undefined;
	}
	if (!secret.kid_matches_custody) {
		return "Encrypted under a different key than the cluster's current secrets key — it may fail to decrypt at load time. Set a new value to re-encrypt.";
	}
	if (secret.unverified) {
		return 'Stored without key-identity verification.';
	}
	return undefined;
}
