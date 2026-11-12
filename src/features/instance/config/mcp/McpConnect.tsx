import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CopyableBlock, CopyableValue } from '@/features/instance/config/githubActions/CopyableText';
import { McpState } from '@/integrations/api/instance/mcp/mcpConfig';
import { useState } from 'react';
import {
	MCP_CLIENTS,
	mcpAddress,
	mcpClientConfig,
	McpConnection,
	McpHost,
	signInCoversApplication,
} from './mcpConnection';

/** How to reach the parts that are on now, as saved: an address only answers once its instance restarts with it. */
export function McpConnect({ hosts, saved, unsavedChanges }: {
	hosts: readonly McpHost[];
	saved: McpState;
	unsavedChanges: boolean;
}) {
	const [hostId, setHostId] = useState<string | undefined>(undefined);
	const host = hosts.find((candidate) => candidate.id === hostId) ?? hosts[0];
	const { operations, application } = saved;

	if (!host) {
		return <p className="text-sm text-muted-foreground">Studio doesn't have an address for this instance yet.</p>;
	}

	const connections: McpConnection[] = [
		operations.on && host.operationsOrigin
		&& { part: 'operations' as const, target: host.operationsOrigin, mountPath: operations.mountPath },
		application.on && host.applicationOrigin
		&& { part: 'application' as const, target: host.applicationOrigin, mountPath: application.mountPath },
	].filter((connection): connection is McpConnection => !!connection);

	return (
		<div className="flex flex-col gap-4 text-sm">
			{unsavedChanges && (
				<p className="text-xs text-muted-foreground">
					These are the saved settings. Save and restart to apply your changes here.
				</p>
			)}

			{hosts.length > 1 && (
				<div className="flex flex-col gap-1">
					<p className="text-xs text-muted-foreground">
						Each instance has its own address. An AI tool keeps a session on the instance it connects to, so give it one
						instance rather than the cluster's address.
					</p>
					<Select value={host.id} onValueChange={setHostId}>
						<SelectTrigger className="w-full max-w-sm" aria-label="Instance">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{hosts.map((candidate) => (
								<SelectItem key={candidate.id} value={candidate.id}>{candidate.label}</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}

			<dl className="flex flex-col gap-2">
				{operations.on && host.operationsOrigin && (
					<div>
						<dt className="font-medium">Operations address</dt>
						<dd>
							<CopyableValue
								value={mcpAddress(host.operationsOrigin, operations.mountPath)}
								label="Copy the operations address"
							/>
						</dd>
					</div>
				)}
				{application.on && host.applicationOrigin && (
					<div>
						<dt className="font-medium">Application address</dt>
						<dd>
							<CopyableValue
								value={mcpAddress(host.applicationOrigin, application.mountPath)}
								label="Copy the application address"
							/>
						</dd>
					</div>
				)}
			</dl>
			<p className="text-xs text-muted-foreground">
				An AI tool that connects to a remote MCP server by its address can use these directly. The steps below use
				Harper's own bridge, which Claude Desktop, Cursor and Zed run on your computer.
			</p>

			<ol className="flex list-decimal flex-col gap-4 pl-5">
				<li>
					Install Harper on your computer. Connecting with <code>harper mcp</code> needs it.
					<CopyableBlock text="npm install --global harper" label="Copy the install command" />
				</li>
				{host.operationsOrigin && (
					<li>
						Sign in once from a terminal, as the Harper database user the AI tool should act as. Its role limits what
						the AI tool can do.
						<CopyableBlock text={`harper login ${host.operationsOrigin}`} label="Copy the sign-in command" />
						<p className="mt-1 text-xs text-muted-foreground">
							Harper saves a token on your computer, so no password goes into the AI tool's settings. The token lasts a
							day by default; run <code>harper login</code> again when the AI tool can't sign in.
							{application.on && (signInCoversApplication(host)
								? ' The application connection uses the same sign-in. Without one, it reaches only what your application lets anonymous users reach.'
								: " The application connection doesn't use this sign-in, so it reaches only what your application lets anonymous users reach.")}
						</p>
					</li>
				)}
				<li>
					Add Harper to your AI tool.
					<Tabs defaultValue={MCP_CLIENTS[0].id} className="mt-2">
						<TabsList>
							{MCP_CLIENTS.map((client) => <TabsTrigger key={client.id} value={client.id}>{client.label}</TabsTrigger>)}
						</TabsList>
						{MCP_CLIENTS.map((client) => {
							const config = mcpClientConfig(client.id, connections);
							return (
								<TabsContent key={client.id} value={client.id}>
									<p className="text-xs text-muted-foreground">
										In <span className="font-mono">{config.file}</span>:
									</p>
									<CopyableBlock text={config.json} label={`Copy the ${client.label} settings`} />
									<ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
										{config.notes.map((note) => <li key={note}>{note}</li>)}
									</ul>
								</TabsContent>
							);
						})}
					</Tabs>
				</li>
			</ol>
		</div>
	);
}
