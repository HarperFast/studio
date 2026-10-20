import { Badge } from '@/components/ui/badge';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radioGroup';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
	clusterPolicySearchQueryOptions,
	MonitoringPolicy,
	MonitoringPolicyApply,
	MonitoringPolicyChange,
	SetMonitoringPolicyResult,
	useSetMonitoringPolicyMutation,
} from '@/features/admin/monitoring/monitoringPolicyApi';
import { useDebounce } from '@/hooks/useDebounce';
import { useContainerOpsPermission } from '@/hooks/usePermissions';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

/** Central manager's limit on `reason`. */
export const REASON_MAX_LENGTH = 500;

export interface PolicyTarget extends MonitoringPolicyChange {
	clusterId: string;
	clusterName?: string | null;
	organizationId: string;
	organizationName?: string | null;
}

export function PolicyBadge({ policy }: { policy: MonitoringPolicy }) {
	return <Badge variant={policy === 'notify' ? 'warning' : 'outline'}>{policy}</Badge>;
}

/**
 * Pick a cluster, then set its policy. Mount it only while open (with a key per target): its state then
 * starts fresh each time instead of describing the session the user abandoned.
 */
export function SetPolicyDialog({ initial, onClose }: { initial: PolicyTarget | null; onClose: () => void }) {
	const [target, setTarget] = useState<PolicyTarget | null>(initial);
	const [result, setResult] = useState<SetMonitoringPolicyResult | null>(null);

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>{result ? 'Policy set' : 'Set monitoring policy'}</DialogTitle>
					<DialogDescription>
						{target
							? `${target.clusterName ?? target.clusterId} · ${target.organizationName ?? target.organizationId}`
							: 'Find the cluster by name or by its clu-… id.'}
					</DialogDescription>
				</DialogHeader>
				{result
					? <PolicyResult result={result} onClose={onClose} />
					: target
					? (
						<PolicyForm
							target={target}
							onChangeCluster={initial ? undefined : () => setTarget(null)}
							onDone={setResult}
							onCancel={onClose}
						/>
					)
					: <ClusterSearch onPick={setTarget} />}
			</DialogContent>
		</Dialog>
	);
}

function ClusterSearch({ onPick }: { onPick: (target: PolicyTarget) => void }) {
	const [term, setTerm] = useState('');
	const debounced = useDebounce(term.trim(), 300);
	const { data, isFetching, isError } = useQuery(clusterPolicySearchQueryOptions(debounced));

	return (
		<div className="space-y-3">
			<div className="space-y-2">
				<Label htmlFor="monitoring-cluster-search">Cluster</Label>
				<Input
					id="monitoring-cluster-search"
					autoFocus
					placeholder="perf-cluster or clu-…"
					value={term}
					onChange={(event) => setTerm(event.target.value)}
				/>
			</div>
			{debounced && (
				<div className="max-h-72 overflow-y-auto rounded-md border">
					{isFetching && !data
						? <Skeleton className="h-16 w-full" />
						: isError
						? <p className="p-3 text-sm text-muted-foreground">Search failed.</p>
						: data?.length
						? (
							<ul>
								{data.map((match) => (
									<li key={match.clusterId}>
										<button
											type="button"
											className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted/30"
											onClick={() => onPick(match)}
										>
											<span className="min-w-0">
												<span className="block truncate">{match.clusterName}</span>
												<span className="block truncate text-xs text-muted-foreground">
													{match.organizationName} · {match.clusterId}
													{match.clusterStatus ? ` · ${match.clusterStatus}` : ''}
												</span>
											</span>
											<PolicyBadge policy={match.monitoringPolicy} />
										</button>
									</li>
								))}
							</ul>
						)
						: <p className="p-3 text-sm text-muted-foreground">No live cluster matches “{debounced}”.</p>}
				</div>
			)}
		</div>
	);
}

function PolicyForm({ target, onChangeCluster, onDone, onCancel }: {
	target: PolicyTarget;
	onChangeCluster?: () => void;
	onDone: (result: SetMonitoringPolicyResult) => void;
	onCancel: () => void;
}) {
	const current = target.monitoringPolicy ?? 'page';
	const [policy, setPolicy] = useState<MonitoringPolicy>(current === 'notify' ? 'page' : 'notify');
	const [reason, setReason] = useState('');
	const [apply, setApply] = useState<MonitoringPolicyApply>('none');
	const [error, setError] = useState<string | null>(null);
	const canRestart = useContainerOpsPermission(target.organizationId);
	const mutation = useSetMonitoringPolicyMutation();

	const submit = () => {
		const trimmed = reason.trim();
		if (!trimmed) {
			setError('Give a reason: it is kept in the cluster’s policy history.');
			return;
		}
		setError(null);
		mutation.mutate(
			{ clusterId: target.clusterId, monitoringPolicy: policy, reason: trimmed, apply },
			{ onSuccess: onDone },
		);
	};

	return (
		<>
			<div className="space-y-5">
				<div className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
					<span>
						Now: <PolicyBadge policy={current} />
						{target.setAt && (
							<span className="ml-2 text-muted-foreground">
								set by {target.setBy ?? 'unknown'} on {new Date(target.setAt).toLocaleString()}
							</span>
						)}
					</span>
					{onChangeCluster && <Button variant="ghost" size="sm" onClick={onChangeCluster}>Change cluster</Button>}
				</div>

				<fieldset className="space-y-2">
					<legend className="text-sm font-medium">Policy</legend>
					<RadioGroup value={policy} onValueChange={(value) => setPolicy(value as MonitoringPolicy)}>
						<Choice
							value="notify"
							label="Notify"
							detail="Criticals go to the alert digest, not the pager."
						/>
						<Choice value="page" label="Page" detail="The default." />
					</RadioGroup>
				</fieldset>

				<div className="space-y-2">
					<Label htmlFor="monitoring-reason">Reason</Label>
					<Textarea
						id="monitoring-reason"
						maxLength={REASON_MAX_LENGTH}
						placeholder="e.g. perf cluster, load tests"
						value={reason}
						onChange={(event) => setReason(event.target.value)}
					/>
				</div>

				<fieldset className="space-y-2">
					<legend className="text-sm font-medium">Apply</legend>
					<RadioGroup value={apply} onValueChange={(value) => setApply(value as MonitoringPolicyApply)}>
						<Choice
							value="none"
							label="At the next recreate (default)"
							detail="Metric and log alerts switch at each container's next upgrade or restart."
						/>
						<Choice
							value="rolling"
							label="Rolling restart now"
							disabled={!canRestart}
							detail={canRestart
								? 'Undrained, one instance at a time. Off-peak only, agreed with the customer.'
								: 'Needs instance:update.'}
						/>
					</RadioGroup>
				</fieldset>

				{error && <p className="text-sm text-destructive">{error}</p>}
			</div>
			<DialogFooter>
				<Button variant="outline" onClick={onCancel}>Cancel</Button>
				<Button variant="submit" disabled={mutation.isPending} onClick={submit}>
					{mutation.isPending ? 'Saving…' : `Set to ${policy}`}
				</Button>
			</DialogFooter>
		</>
	);
}

function Choice({ value, label, detail, disabled }: {
	value: string;
	label: string;
	detail: string;
	disabled?: boolean;
}) {
	const id = `monitoring-choice-${value}`;
	return (
		<div className="flex items-start gap-3">
			<RadioGroupItem id={id} value={value} disabled={disabled} className="mt-1" />
			<Label htmlFor={id} className="block font-normal leading-snug">
				<span className="block font-medium">{label}</span>
				<span className="block text-sm text-muted-foreground">{detail}</span>
			</Label>
		</div>
	);
}

function PolicyResult({ result, onClose }: { result: SetMonitoringPolicyResult; onClose: () => void }) {
	const rolling = result.apply === 'rolling';
	return (
		<>
			<ul className="space-y-2 text-sm">
				<li>
					Set to <PolicyBadge policy={result.monitoringPolicy} /> on {result.instanceIds.length}{' '}
					{result.instanceIds.length === 1 ? 'instance' : 'instances'}.
				</li>
				{result.projectionErrors.length > 0 && (
					<li className="text-destructive">
						Not recorded on:{' '}
						{result.projectionErrors.map((entry) => `${entry.target} (${entry.error})`).join(', ')}. Set it again to
						retry.
					</li>
				)}
				{rolling && result.applyError && (
					<li className="text-destructive">
						Restart did not start: {result.applyError}
					</li>
				)}
				{rolling && !result.applyError && <li>Rolling restart started.</li>}
			</ul>
			<DialogFooter>
				<Button variant="submit" onClick={onClose}>Done</Button>
			</DialogFooter>
		</>
	);
}
