import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { TriangleAlertIcon } from 'lucide-react';
import { useSupportsTerminal } from './hooks/useSupportsTerminal';
import { TerminalView } from './TerminalView';

/**
 * Interactive terminal page (PROTOTYPE). super_user-only, direct-connection-only.
 * Pairs with the Harper component on branch claude/instance-terminal-prototype.
 */
export function InstanceTerminal() {
	const { entityId } = useInstanceClientIdParams();
	const canManage = useInstanceManagePermission();
	const supportsTerminal = useSupportsTerminal();

	if (!canManage) {
		return (
			<Notice
				title="Terminal unavailable"
				body="The interactive terminal requires super_user access on this instance."
			/>
		);
	}

	if (!supportsTerminal) {
		return (
			<Notice
				title="Terminal unavailable over this connection"
				body="A live terminal needs a direct connection to the instance. This session is routed through the Fabric Connect proxy, which buffers streamed responses and can't carry a WebSocket."
			/>
		);
	}

	return (
		<div className="flex flex-col gap-4 p-4">
			<PrototypeBanner />
			<TerminalView entityId={entityId} />
		</div>
	);
}

function PrototypeBanner() {
	return (
		<div className="flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
			<TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-yellow-600" />
			<div>
				<div className="font-semibold">Prototype — super_user shell inside the instance container</div>
				<div className="text-muted-foreground">
					This opens a real shell running inside your Harper instance. Sessions are audit-logged on the instance.
					Requires the instance to run Harper with the terminal component enabled (<code>terminal.enabled: true</code>).
				</div>
			</div>
		</div>
	);
}

function Notice({ title, body }: { title: string; body: string }) {
	return (
		<div className="p-4">
			<div className="rounded-md border p-4">
				<div className="font-semibold">{title}</div>
				<div className="text-sm text-muted-foreground">{body}</div>
			</div>
		</div>
	);
}
