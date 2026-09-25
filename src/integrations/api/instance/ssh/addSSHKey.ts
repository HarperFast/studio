import { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { SSHKeyName } from '@/integrations/api/instance/ssh/listSSHKeys';
import { sshPrivateKeySchema } from '@/integrations/api/instance/ssh/sshPrivateKey';
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

/*
 * Both land in the node's one ssh config, as `Host <host>` and `HostName <hostname>`: a space makes
 * `Host a b` match "a" and "b" instead of the alias, and makes `HostName a b` a config error that
 * stops ssh for every key on the node. git and ssh also refuse a hostname starting with a dash.
 */
const HOST_CHARACTERS = /^(?!-)[A-Za-z0-9._-]+$/;
const IPV6 = z.ipv6();

export const SSHKeySchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, { error: 'Name is required.' })
			.regex(/^[a-zA-Z0-9-_]*$/, { error: 'Can only contain letters, numbers, dashes and underscores.' }),
		key: sshPrivateKeySchema,
		host: z
			.string()
			.trim()
			.min(1, { error: 'Host is required.' })
			.regex(HOST_CHARACTERS, {
				error:
					'Can only contain letters, numbers, dots, dashes and underscores, and not start with a dash, like "my-repo.github.com".',
			}),
		hostname: z
			.string()
			.trim()
			.min(1, { error: 'Hostname is required.' })
			.refine((hostname) => HOST_CHARACTERS.test(hostname) || IPV6.safeParse(hostname).success, {
				error: 'Enter just the hostname, like "github.com" — no "git@", scheme, port or path.',
			}),
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

/**
 * Collisions with the keys the instance already has, for `SSHKeySchema.superRefine`. Harper refuses a
 * duplicate name itself, though only once the form is submitted, but accepts a duplicate alias: the
 * second `Host` block then only adds its key to the ones ssh offers for that alias, and the first
 * block's `HostName` still wins — so imports through it can authenticate with the wrong key.
 */
export function refineAgainstExistingSSHKeys(existingKeys: readonly SSHKeyName[]) {
	return (data: z.output<typeof SSHKeySchema>, ctx: z.RefinementCtx) => {
		if (existingKeys.some((existing) => existing.name === data.name)) {
			ctx.addIssue({
				code: 'custom',
				path: ['name'],
				message: 'A key with this name already exists. Pick another name, or edit that key to replace it.',
			});
		}
		const alias = data.host.toLowerCase();
		const sharesAlias = existingKeys.find((existing) => existing.host?.toLowerCase() === alias);
		if (sharesAlias) {
			ctx.addIssue({
				code: 'custom',
				path: ['host'],
				message: `The key "${sharesAlias.name}" already uses the alias "${sharesAlias.host}". Each key needs its own.`,
			});
		}
	};
}

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
