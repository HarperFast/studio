import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useDeployFromGitHubAvailable } from '@/features/instance/config/deployFromGitHub/useDeployFromGitHubAvailable';
import { getSSHKeyQueryOptions } from '@/integrations/api/instance/ssh/getSSHKey';
import { listSSHKeysQueryOptions } from '@/integrations/api/instance/ssh/listSSHKeys';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { UseFormWatch } from 'react-hook-form';
import { z } from 'zod';
import { importedGitHubRepository } from './gitUrl';
import { NewApplicationSchema } from './schema';

/**
 * An import installs a repository once. When it is a GitHub repository, this links to Deploy from GitHub with the
 * application and repository filled in, so its merges can deploy from then on.
 */
export function DeployFromGitHubHint({ project, watch }: {
	project: string;
	watch: UseFormWatch<z.infer<typeof NewApplicationSchema>>;
}) {
	const params: { clusterId?: string; instanceId?: string; organizationId?: string } = useParams({ strict: false });
	const instanceParams = useInstanceClientIdParams();
	const available = useDeployFromGitHubAvailable();
	const requiresAuth = watch('contents.requiresAuth');
	const sshKeyName = watch('contents.sshKeyName');
	// A URL on an SSH key's host alias, read as ImportAuthorization reads it: a listed row may carry only a name.
	const { data: sshKeys } = useQuery({
		...listSSHKeysQueryOptions(instanceParams),
		enabled: available && requiresAuth,
	});
	const { data: selectedKey } = useQuery({
		...getSSHKeyQueryOptions({ ...instanceParams, name: sshKeyName }),
		refetchInterval: false,
		enabled: available && requiresAuth && !!sshKeyName,
	});
	const listedKey = sshKeys?.find((key) => key.name === sshKeyName);
	const sshKey = requiresAuth
		? { host: selectedKey?.host ?? listedKey?.host, hostname: selectedKey?.hostname ?? listedKey?.hostname }
		: undefined;
	const repository = importedGitHubRepository(watch('contents.ref'), sshKey);

	if (!available || !project || !repository) {
		return null;
	}
	return (
		<p className="text-sm text-muted-foreground">
			Want every merge to {repository} to deploy here?{' '}
			<Link
				to={buildAbsoluteLinkToPage(params, 'config/deploy-from-github')}
				search={{ project, repository }}
				className="underline hover:text-foreground"
			>
				Set up deploys from GitHub
			</Link>
		</p>
	);
}
