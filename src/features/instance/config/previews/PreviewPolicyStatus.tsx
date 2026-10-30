import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PreviewPolicy, PreviewSetupState } from '@/integrations/api/instance/previews/previews';
import { parseGitHubRepository } from '@/integrations/github/lookUpGitHubRepository';
import { TriangleAlertIcon } from 'lucide-react';
import { ReactNode } from 'react';

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<>
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="break-all">{children}</dd>
		</>
	);
}

export function PreviewPolicyStatus({
	policy,
	state,
	disabling,
	offerDisable,
	onDisableClick,
}: {
	policy: PreviewPolicy;
	state: PreviewSetupState;
	disabling: boolean;
	offerDisable: boolean;
	onDisableClick: () => void;
}) {
	const constraints = policy.grant?.constraints;
	const repository = policy.repository && parseGitHubRepository(policy.repository);
	return (
		<section className="flex flex-col gap-3 rounded-md border p-4" aria-label="Preview status">
			<div className="flex flex-wrap items-center gap-2">
				<h3 className="text-sm font-semibold">Status</h3>
				{policy.enabled
					? <Badge variant="success">Enabled</Badge>
					: <Badge variant="destructive">Needs attention</Badge>}
			</div>
			<dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
				<Field label="Repository">
					{repository
						? (
							<a className="underline" href={`https://github.com/${repository}`} target="_blank" rel="noreferrer">
								{repository}
							</a>
						)
						: '—'}
				</Field>
				<Field label="Branch">{policy.branch ?? '—'}</Field>
				<Field label="Data">
					{!constraints
						? '—'
						: constraints.branchedDatabases === 'required'
						? 'Branched: each preview gets its own copy'
						: 'Shared'}
				</Field>
				<Field label="Most previews">{constraints ? constraints.maxPreviews ?? "The cluster's default" : '—'}</Field>
				<Field label="Longest life">
					{constraints?.maxTtlDays === undefined ? '—' : `${constraints.maxTtlDays} days`}
				</Field>
				<Field label="Host names">{constraints?.hostSuffix ? `*${constraints.hostSuffix}` : '—'}</Field>
			</dl>
			{policy.problems.length > 0 && (
				<Alert variant="destructive">
					<TriangleAlertIcon />
					<AlertTitle>CI can't use this setup</AlertTitle>
					<AlertDescription>
						<ul className="list-disc pl-4">
							{policy.problems.map((problem) => <li key={problem}>{problem}</li>)}
						</ul>
					</AlertDescription>
				</Alert>
			)}
			{state === 'incomplete' && offerDisable && (
				<div>
					<p className="mb-2 text-sm text-muted-foreground">
						If a disable stopped partway, running it again resumes it. It also clears a damaged setup, so previews can
						be enabled again.
					</p>
					<Button size="sm" variant="destructiveOutline" disabled={disabling} onClick={onDisableClick}>
						Disable previews
					</Button>
				</div>
			)}
		</section>
	);
}
