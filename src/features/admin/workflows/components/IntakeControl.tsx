import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { INTAKE_MODES, IntakeMode, useSetIntakeMutation } from '@/features/admin/workflows/workflowAdminApi';
import { useStaffPermission } from '@/hooks/useAuth';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

// As central manager's executor reads WORKFLOW_INTAKE: one switch for both nodes, never a reason to refuse a request.
export const INTAKE_COPY: Record<IntakeMode, { label: string; now: string; onSwitch: string }> = {
	open: {
		label: 'Open',
		now: 'Workflows start and run as normal.',
		onSwitch: 'Queued workflows start, and workflows paused by intake continue from the step where they stopped.',
	},
	queue: {
		label: 'Queue',
		now: 'New workflows are accepted but don’t start. Running ones continue.',
		onSwitch:
			'New workflows are accepted but wait to start. Running workflows continue; ones already paused by intake stay paused.',
	},
	pause: {
		label: 'Pause',
		now: 'Nothing starts or runs. Running workflows stop at their next step and continue once intake is open.',
		onSwitch:
			'New workflows wait, and every running workflow stops at its next step boundary. They continue on their own once intake is set back to Open.',
	},
};

export function IntakeControl({ mode }: { mode: IntakeMode }) {
	const canManage = useStaffPermission('workflow:manage');
	const mutation = useSetIntakeMutation();
	const [asked, setAsked] = useState<IntakeMode | null>(null);

	const confirm = () => {
		if (!asked || mutation.isPending) { return; }
		const next = asked;
		mutation.mutate(next, {
			onSuccess: () => {
				toast.success(`Workflow intake set to ${INTAKE_COPY[next].label}`);
				setAsked(null);
			},
		});
	};

	return (
		<div className="flex w-full flex-col items-start gap-1.5 text-sm xl:w-auto">
			<span className="text-xs font-medium text-muted-foreground" id="workflow-intake-label">Workflow intake</span>
			<Select
				value={mode}
				disabled={!canManage || mutation.isPending}
				onValueChange={(next) => next !== mode && setAsked(next as IntakeMode)}
			>
				<SelectTrigger className="w-full min-w-0 sm:w-48" aria-labelledby="workflow-intake-label">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{INTAKE_MODES.map((option) => <SelectItem key={option} value={option}>{INTAKE_COPY[option].label}
					</SelectItem>)}
				</SelectContent>
			</Select>
			<p className="max-w-80 text-xs text-muted-foreground">{INTAKE_COPY[mode].now}</p>
			{asked && (
				<Dialog open onOpenChange={(open) => !open && !mutation.isPending && setAsked(null)}>
					<DialogContent className="sm:max-w-lg">
						<DialogHeader>
							<DialogTitle>Set workflow intake to {INTAKE_COPY[asked].label}?</DialogTitle>
							<DialogDescription>{INTAKE_COPY[asked].onSwitch}</DialogDescription>
						</DialogHeader>
						<p className="text-sm text-muted-foreground">
							This applies to every workflow on both central manager nodes.
							{asked !== 'open'
								&& ' Customer requests are still accepted; their changes wait, and the clusters they touch stay held until they run.'}
						</p>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								disabled={mutation.isPending}
								onClick={() => setAsked(null)}
							>
								Cancel
							</Button>
							<Button
								type="button"
								variant={asked === 'open' ? 'default' : 'destructive'}
								disabled={mutation.isPending}
								onClick={confirm}
							>
								{mutation.isPending && <Loader2Icon className="animate-spin" />}
								Set to {INTAKE_COPY[asked].label}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</div>
	);
}
