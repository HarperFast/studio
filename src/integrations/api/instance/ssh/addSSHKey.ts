import { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

/**
 * Bare registry hostnames that must not be used as the `host` alias. SSH auth resolves the
 * key purely from the host in the URL, so reusing a bare registry hostname (e.g. github.com)
 * across keys makes them collide and silently picks the wrong key. Each key needs a unique
 * alias like "my-repo.github.com".
 */
const BARE_REGISTRY_HOSTS = new Set([
	'github.com',
	'ssh.github.com',
	'gitlab.com',
	'altssh.gitlab.com',
	'bitbucket.org',
]);

const ALIAS_GUIDANCE = 'Use a unique alias like "my-repo.github.com" instead of a bare registry hostname.';

export const SSHKeySchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1)
			.regex(/^[a-zA-Z0-9-_]*$/, { error: 'Can only contain letters, numbers, dashes and underscores.' }),
		key: z.string().min(1).trim(),
		host: z.string().min(1).trim(),
		hostname: z.string().min(1).trim(),
		known_hosts: z.string().trim().optional(),
	})
	.refine((data) => !BARE_REGISTRY_HOSTS.has(data.host.trim().toLowerCase()), {
		path: ['host'],
		error: ALIAS_GUIDANCE,
	})
	.refine((data) => data.host.trim().toLowerCase() !== data.hostname.trim().toLowerCase(), {
		path: ['host'],
		error: `Host alias must differ from the hostname. ${ALIAS_GUIDANCE}`,
	});

type AddSSHKeyFormData = z.infer<typeof SSHKeySchema> & InstanceClientIdConfig & InstanceTypeConfig;

async function addSSHKey(formData: AddSSHKeyFormData) {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { instanceClient, entityType, entityId, ...sshKey } = formData;
	const { data } = await instanceClient.post<ReplicatedResponse>('/', {
		operation: 'add_ssh_key',
		replicated: entityType === 'cluster',
		...sshKey,
	});
	return data;
}

export function useAddSSHKey() {
	return useMutation({
		mutationFn: addSSHKey,
	});
}
