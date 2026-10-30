import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useSecretsKeySource } from '@/features/instance/secrets/useSecretsKeySource';
import { previewComponentPattern, previewCredentialSecretName } from '@/integrations/api/instance/previews/previews';
import {
	listSecretsQueryOptions,
	ListSecretsResponse,
	SecretMetadata,
	secretsPublicKeyQueryOptions,
	useGrantSecret,
	useSetSecret,
} from '@/integrations/api/instance/secrets/secrets';
import { gitHubRepositoryQueryOptions } from '@/integrations/github/lookUpGitHubRepository';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';

const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

/** `ungranted`: stored, as when the grant failed after the seal, so `harper preview deploy` can't use it yet. */
export type PreviewCredentialState = 'none' | 'ungranted' | 'sealed';

export function usePreviewCredentialState(app: string, enabled: boolean): PreviewCredentialState {
	const instanceParams = useInstanceClientIdParams();
	const { data } = useQuery({ ...listSecretsQueryOptions(instanceParams), enabled });
	const name = previewCredentialSecretName(app);
	const secret = data?.secrets.find((candidate) => candidate.name === name);
	if (!secret) {
		return 'none';
	}
	return secret.grants.includes(previewComponentPattern(app)) ? 'sealed' : 'ungranted';
}

/**
 * The GitHub token the cluster fetches a private repository's PR commits with: what `harper preview setup
 * credential=true` does, in the browser. It is sealed to the cluster's public key here, so only ciphertext leaves, and
 * it can't be read back. The two calls match the CLI's `storeSealedSecret`: a `set_secret` carrying `grants` would
 * replace any grant someone added to the row by hand, and `grant_secret` only adds this one.
 */
export function PreviewCredential({ app, repository }: { app: string; repository: string }) {
	const instanceParams = useInstanceClientIdParams();
	const { keySource, known, clusterInfoUnavailable } = useSecretsKeySource(instanceParams);
	const { data: lookup } = useQuery(gitHubRepositoryQueryOptions(repository));
	// Only when a token is wanted: a cluster with no secrets key fails this read, and a public repository never needs it.
	const needsToken = !!lookup && !(lookup.status === 'found' && !lookup.repository.private);
	const { isError: noSecretsKey } = useQuery({
		...secretsPublicKeyQueryOptions(keySource),
		enabled: known && needsToken,
	});
	const { refetch } = useQuery(listSecretsQueryOptions(instanceParams));
	const credential = usePreviewCredentialState(app, true);
	const queryClient = useQueryClient();
	const { mutateAsync: setSecret, reset: resetSetSecret, isPending: isSetting } = useSetSecret();
	const { mutateAsync: grantSecret, isPending: isGranting } = useGrantSecret();
	const [token, setToken] = useState('');

	if (!needsToken) {
		return null;
	}

	const name = previewCredentialSecretName(app);
	const onSubmit = async (event: FormEvent) => {
		event.preventDefault();
		try {
			await setSecret({ ...keySource, name, value: token.trim(), processEnv: false });
			resetSetSecret();
			const { grants } = await grantSecret({ ...instanceParams, name, component: previewComponentPattern(app) });
			// So the badge and the workflow follow the write even if the read below fails.
			queryClient.setQueryData<ListSecretsResponse>(
				listSecretsQueryOptions(instanceParams).queryKey,
				(current) =>
					current && {
						...current,
						secrets: [
							...current.secrets.filter((secret) => secret.name !== name),
							{ ...current.secrets.find((secret) => secret.name === name), name, grants } as SecretMetadata,
						],
					},
			);
			setToken('');
			toast.success('Sealed the GitHub token on the cluster.');
		} catch {
			// The mutation cache has toasted it, and the token stays in the field to try again.
		} finally {
			resetSetSecret();
			await refetch();
		}
	};

	return (
		<section className="flex flex-col gap-2 rounded-md border p-4 text-sm" aria-label="GitHub token">
			<div className="flex flex-wrap items-center gap-2">
				<h3 className="font-semibold">GitHub token</h3>
				{credential === 'sealed'
					? <Badge variant="success">Sealed</Badge>
					: <Badge variant="warning">{credential === 'ungranted' ? 'Not granted' : 'Not set'}</Badge>}
			</div>
			<p className="text-muted-foreground">
				{repository}{' '}
				isn't public, or GitHub couldn't say. A private repository needs a token the cluster can fetch each pull request
				with. It is encrypted in this browser and can't be read back.
			</p>
			{credential === 'ungranted' && <p>A token is stored, but no preview can use it yet. Seal it again to finish.</p>}
			{clusterInfoUnavailable
				? (
					<p className="text-muted-foreground">
						This cluster's info couldn't be loaded, so Studio doesn't know which key to encrypt the token with. Reload
						to try again.
					</p>
				)
				: noSecretsKey
				? (
					<p className="text-muted-foreground">
						This cluster has no secrets key, so it can't hold a token. Private repositories can't be previewed until it
						has one.
					</p>
				)
				: (
					<form className="flex flex-col gap-2" onSubmit={(event) => void onSubmit(event)}>
						<label className="flex max-w-md flex-col gap-1">
							{credential === 'none' ? 'Fine-grained token' : 'Replace the token'}
							<Input
								type="password"
								// Not a sign-in: a saved password filled in here would be sealed as the token.
								autoComplete="new-password"
								value={token}
								onChange={(event) => setToken(event.target.value)}
							/>
						</label>
						<p className="text-muted-foreground">
							<a className="underline" href={NEW_TOKEN_URL} target="_blank" rel="noreferrer">
								Create one
							</a>{' '}
							with access to this repository only and the Contents: Read-only permission. Commit the workflow below
							again after adding it, since it passes <code className="font-mono">credential=true</code>.
						</p>
						<div>
							<Button type="submit" size="sm" disabled={!token.trim() || !known || isSetting || isGranting}>
								Seal token
							</Button>
						</div>
					</form>
				)}
		</section>
	);
}
