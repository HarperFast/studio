import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
	useWorkflowCommandMutation,
	WORKFLOW_COMMANDS,
	WorkflowCommand,
	WorkflowDetail,
} from '@/features/admin/workflows/workflowAdminApi';
import { useStaffPermission } from '@/hooks/useAuth';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';

const COMMAND_COPY: Record<
	WorkflowCommand,
	{ label: string; title: string; variant: 'defaultOutline' | 'destructiveOutline' }
> = {
	pause: { label: 'Pause', title: 'Stop at the next step boundary', variant: 'defaultOutline' },
	resume: { label: 'Resume', title: 'Continue from where it was paused', variant: 'defaultOutline' },
	retry: { label: 'Retry', title: 'Re-enter the failed step or item', variant: 'defaultOutline' },
	undo: { label: 'Undo', title: 'Run the undo chain back to the start', variant: 'destructiveOutline' },
	abandon: {
		label: 'Abandon',
		title: 'End it after its cleanup, leaving what was done',
		variant: 'destructiveOutline',
	},
};

/**
 * The commands this row accepts, exactly as central manager computed them (`acceptedCommands`, from the rule it checks
 * the command against under the row lock), and only for an account that may send them.
 */
export function offeredCommands(
	detail: Pick<WorkflowDetail, 'acceptedCommands'>,
	canManage: boolean,
): WorkflowCommand[] {
	if (!canManage) { return []; }
	return WORKFLOW_COMMANDS.filter((command) => detail.acceptedCommands.includes(command));
}

export function WorkflowCommands({ detail }: { detail: WorkflowDetail }) {
	const canManage = useStaffPermission('workflow:manage');
	const mutation = useWorkflowCommandMutation();
	const [abandoning, setAbandoning] = useState(false);
	const commands = offeredCommands(detail, canManage);
	// Central manager refuses any command while one is still waiting for the executor; acceptedCommands doesn't say so.
	const pending = !!detail.command?.action;

	if (!commands.length) { return null; }

	const send = (command: WorkflowCommand) => {
		if (command === 'abandon') {
			setAbandoning(true);
			return;
		}
		mutation.mutate({ id: detail.id, command });
	};

	return (
		<div className="flex flex-wrap items-center gap-2" aria-label="Workflow commands" role="group">
			{commands.map((command) => (
				<Button
					key={command}
					type="button"
					size="sm"
					variant={COMMAND_COPY[command].variant}
					title={COMMAND_COPY[command].title}
					disabled={mutation.isPending || pending}
					onClick={() => send(command)}
				>
					{mutation.isPending && mutation.variables?.command === command && <Loader2Icon className="animate-spin" />}
					{COMMAND_COPY[command].label}
				</Button>
			))}
			{abandoning && (
				<AbandonDialog
					key={detail.id}
					workflowId={detail.id}
					held={pending}
					onClose={() => setAbandoning(false)}
				/>
			)}
		</div>
	);
}

/**
 * Mount only while open, keyed by the workflow, so a reason typed for one attempt never carries into the next or onto
 * another workflow. `held`: another command arrived meanwhile, which central manager would refuse this behind.
 */
export function AbandonDialog(
	{ workflowId, held = false, onClose }: { workflowId: string; held?: boolean; onClose: () => void },
) {
	const mutation = useWorkflowCommandMutation();
	const [reason, setReason] = useState('');
	const trimmed = reason.trim();

	const abandon = () => {
		if (!trimmed || held || mutation.isPending) { return; }
		mutation.mutate({ id: workflowId, command: 'abandon', reason: trimmed }, {
			onSuccess: onClose,
		});
	};

	return (
		<Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Abandon this workflow?</DialogTitle>
					<DialogDescription>
						It stops at the next step boundary, runs its cleanup and releases the cluster. Steps already done are not
						undone. The reason goes to the admin audit.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					<Label htmlFor="abandon-reason" className="block font-normal">Reason</Label>
					<Textarea
						id="abandon-reason"
						autoFocus
						value={reason}
						disabled={mutation.isPending}
						onChange={(event) => setReason(event.target.value)}
						placeholder="Why it is being abandoned"
					/>
				</div>
				<DialogFooter>
					<Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancel</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={!trimmed || held || mutation.isPending}
						onClick={abandon}
					>
						{mutation.isPending && <Loader2Icon className="animate-spin" />}
						Abandon
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
