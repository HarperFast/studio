import { Instance } from '@/integrations/api/api.patch';
import { McpPart } from '@/integrations/api/instance/mcp/mcpConfig';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';

/** Where one Harper instance serves each part. An AI tool connects straight to it, not through Fabric. */
export interface McpHost {
	id: string;
	label: string;
	/** e.g. `https://node.example.com:9925` */
	operationsOrigin: string | null;
	applicationOrigin: string | null;
}

/** The instance's own HTTP ports, from its configuration's `http` block. */
export type McpHttpPorts = { port?: unknown; securePort?: unknown } | undefined;

function originOf(url: string | null): string | null {
	if (!url) {
		return null;
	}
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
}

/** The application part on the same host, at the HTTP port the configuration names (the secure one when set). */
function applicationOriginOn(hostname: string, http: McpHttpPorts): string | null {
	const securePort = Number(http?.securePort);
	const port = Number(http?.port);
	return securePort > 0
		? `https://${hostname}:${securePort}`
		: port > 0
		? `http://${hostname}:${port}`
		: null;
}

/**
 * Each instance gets its own addresses rather than the cluster's: an MCP session lives in a `system.mcp_session`
 * row that does not replicate (harper `components/mcp/DESIGN.md`), so a client a load balancer moves to another
 * member loses its session. Fabric serves the application part on the instance's HTTPS address at 443; a
 * self-managed instance (`selfManagedHttp`) serves it on its own configured port.
 */
export function mcpHostForInstance(
	instance: Pick<Instance, 'id' | 'name' | 'instanceFqdn' | 'operationsApiSecure' | 'operationsApiPort'>,
	selfManagedHttp?: McpHttpPorts,
): McpHost {
	const operationsOrigin = originOf(getOperationsUrlForInstance(instance));
	const hostname = operationsOrigin && new URL(operationsOrigin).hostname;
	return {
		id: instance.id,
		label: instance.name || instance.instanceFqdn || instance.id,
		operationsOrigin,
		applicationOrigin: !hostname
			? null
			: selfManagedHttp
			? applicationOriginOn(hostname, selfManagedHttp)
			: `https://${hostname}`,
	};
}

/** Local Studio is served by the instance's own operations API, so that is the page's origin. */
export function localMcpHost(operationsOrigin: string, http: McpHttpPorts): McpHost {
	const origin = originOf(operationsOrigin);
	return {
		id: 'local',
		label: 'This instance',
		operationsOrigin: origin,
		applicationOrigin: origin && applicationOriginOn(new URL(origin).hostname, http),
	};
}

export function mcpAddress(origin: string, mountPath: string): string {
	return `${origin}${mountPath}`;
}

export type McpClient = 'claude-desktop' | 'cursor' | 'zed';

export const MCP_CLIENTS: ReadonlyArray<{ id: McpClient; label: string }> = [
	{ id: 'claude-desktop', label: 'Claude Desktop' },
	{ id: 'cursor', label: 'Cursor' },
	{ id: 'zed', label: 'Zed' },
];

export interface McpConnection {
	part: McpPart;
	/** The origin `harper mcp --target` takes; the mount path goes in its own flag. */
	target: string;
	mountPath: string;
}

/** `harper mcp print-config` always says `harper`; two parts need two keys. */
function mcpServerName(part: McpPart): string {
	return part === 'operations' ? 'harper' : 'harper-application';
}

/**
 * The arguments `harper mcp print-config` emits (harper `bin/mcp/printConfig.ts` `renderConfig`), in its order.
 * Never a credential: the bridge falls back to the token `harper login` saved for the target
 * (`bin/mcp/client.ts` `computeAuthHeader`).
 */
export function harperMcpArgs({ part, target, mountPath }: McpConnection): string[] {
	return [
		'mcp',
		...(part === 'application' ? ['--profile', 'application'] : []),
		'--target',
		target,
		...(mountPath === '/mcp' ? [] : ['--mount-path', mountPath]),
	];
}

/**
 * The key `harper login` saves a token under, and `harper mcp` looks one up by (harper `bin/cliCredentials.ts`
 * `normalizeTarget`): a target written without a port is keyed at 9925.
 */
export function harperLoginKey(target: string): string | null {
	const withScheme = /^https?:\/\//.test(target) ? target : `https://${target}`;
	try {
		const url = new URL(withScheme);
		// Read off the raw text, as Harper does: `URL` drops a default port that was written out.
		const authority = withScheme.slice(withScheme.indexOf('://') + 3).split(/[/?#]/)[0];
		const written = !!url.port || authority.slice(authority.lastIndexOf('@') + 1).includes(':');
		const port = !written ? '9925' : url.port || (url.protocol === 'https:' ? '443' : '80');
		return `${url.protocol}//${url.hostname}:${port}/`;
	} catch {
		return null;
	}
}

/**
 * Whether the token `harper login <operations origin>` saves also signs in the application connection. It does on
 * Fabric, whose application target has no port and so is looked up at the operations port.
 */
export function signInCoversApplication(host: Pick<McpHost, 'operationsOrigin' | 'applicationOrigin'>): boolean {
	if (!host.operationsOrigin || !host.applicationOrigin) {
		return false;
	}
	const key = harperLoginKey(host.applicationOrigin);
	return key !== null && key === harperLoginKey(host.operationsOrigin);
}

export interface McpClientConfig {
	file: string;
	json: string;
	notes: string[];
}

/** A paste-ready block for each client, the same shape `harper mcp print-config --client <name>` prints. */
export function mcpClientConfig(client: McpClient, connections: readonly McpConnection[]): McpClientConfig {
	const servers = (entry: (args: string[]) => unknown) =>
		Object.fromEntries(connections.map((connection) => [
			mcpServerName(connection.part),
			entry(harperMcpArgs(connection)),
		]));
	switch (client) {
		case 'claude-desktop':
			return {
				file: '~/Library/Application Support/Claude/claude_desktop_config.json (macOS) or '
					+ '%APPDATA%\\Claude\\claude_desktop_config.json (Windows)',
				json: JSON.stringify({ mcpServers: servers((args) => ({ command: 'harper', args })) }, null, 2),
				notes: [
					'Restart Claude Desktop after editing the file.',
					'Merge into an existing mcpServers block if you already have one.',
				],
			};
		case 'cursor':
			return {
				file: '~/.cursor/mcp.json',
				json: JSON.stringify({ mcpServers: servers((args) => ({ command: 'harper', args })) }, null, 2),
				notes: ['Cursor reads this file at startup; restart it after editing.'],
			};
		case 'zed':
			return {
				file: "Zed's settings.json",
				json: JSON.stringify(
					{ context_servers: servers((args) => ({ command: { path: 'harper', args, env: {} } })) },
					null,
					2,
				),
				notes: ["Zed's MCP support is behind a feature flag; see Zed's documentation to turn it on."],
			};
	}
}
