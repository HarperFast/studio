import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LOOK_BACK_CHOICES, RUN_REF_MAX, useStartRunMutation } from '@/features/admin/agent/agentAdminApi';
import { formatUsd } from '@/features/admin/agent/components/AgentBits';
import { useNavigate } from '@tanstack/react-router';
import { Loader2Icon, SearchIcon } from 'lucide-react';
import { FormEvent, useId, useState } from 'react';
import { toast } from 'sonner';

const LOOK_BACK_LABEL: Record<(typeof LOOK_BACK_CHOICES)[number], string> = {
	60: 'Last hour',
	360: 'Last 6 hours',
	1_440: 'Last 24 hours',
	10_080: 'Last 7 days',
};

interface StartRunProps {
	/** Why no run can start right now, from the overview; the button stays usable so the reason is readable. */
	offReason: string | null;
	runBudgetUsd: number | null | undefined;
}

/** Staff start a manual investigation of one cluster. AgentAdminIndex renders it only with agent:run. */
export function StartRunButton(props: StartRunProps) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button type="button" size="sm" onClick={() => setOpen(true)}>
				<SearchIcon />Investigate a cluster
			</Button>
			{open && <StartRunDialog {...props} onClose={() => setOpen(false)} />}
		</>
	);
}

function StartRunDialog({ offReason, runBudgetUsd, onClose }: StartRunProps & { onClose: () => void }) {
	const navigate = useNavigate();
	const mutation = useStartRunMutation();
	const [clusterId, setClusterId] = useState('');
	const [lookBack, setLookBack] = useState<number>(LOOK_BACK_CHOICES[0]);
	const [ref, setRef] = useState('');
	const ids = { cluster: useId(), lookBack: useId(), ref: useId() };
	const cluster = clusterId.trim();
	const canSubmit = cluster !== '' && offReason === null && !mutation.isPending;

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (!canSubmit) { return; }
		// Errors (unknown cluster, budget used up, agent off) reach the global toast; the dialog stays open to fix the input.
		mutation.mutate({ clusterId: cluster, lookBackMinutes: lookBack, ref: ref.trim() || undefined }, {
			onSuccess: (run) => {
				toast.success(run.attached ? 'This cluster already has an open run' : 'Investigation started', {
					description: run.attached ? `Showing ${run.id} instead of starting another.` : run.id,
				});
				onClose();
				void navigate({ to: '/admin/agent/$runId', params: { runId: run.id } });
			},
		});
	};

	return (
		<Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<form onSubmit={submit} className="space-y-5">
					<DialogHeader>
						<DialogTitle>Investigate a cluster</DialogTitle>
						<DialogDescription>
							The agent reads the cluster's evidence for the window you pick and writes a finding. It never changes the
							cluster.{' '}
							{runBudgetUsd != null && `A run costs at most ${formatUsd(runBudgetUsd)} of this month's budget.`}
						</DialogDescription>
					</DialogHeader>
					{offReason && <p role="alert" className="text-sm text-destructive">{offReason}</p>}
					<div className="space-y-1.5">
						<Label htmlFor={ids.cluster}>Cluster id</Label>
						<Input
							id={ids.cluster}
							value={clusterId}
							onChange={(event) => setClusterId(event.target.value)}
							autoFocus
							autoComplete="off"
							spellCheck={false}
							className="font-mono"
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor={ids.lookBack}>Look back</Label>
						<Select value={String(lookBack)} onValueChange={(next) => setLookBack(Number(next))}>
							<SelectTrigger id={ids.lookBack} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{LOOK_BACK_CHOICES.map((minutes) => (
									<SelectItem key={minutes} value={String(minutes)}>{LOOK_BACK_LABEL[minutes]}</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor={ids.ref}>Reason (optional)</Label>
						<Input
							id={ids.ref}
							value={ref}
							maxLength={RUN_REF_MAX}
							onChange={(event) => setRef(event.target.value)}
							placeholder="Ticket, alert or a few words"
						/>
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={!canSubmit}>
							{mutation.isPending && <Loader2Icon className="animate-spin" />}
							Start investigation
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
