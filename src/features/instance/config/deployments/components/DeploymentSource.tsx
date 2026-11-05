import { Badge } from '@/components/ui/badge';
import { Deployment, DeploymentSource } from '@/integrations/api/instance/deployments/types';
import { useNavigate } from '@tanstack/react-router';
import { type DeploymentsSearch, isCommitSha } from '../deploymentsSearch';
import { deploymentSource } from '../functions/deploymentSource';
import { describeSource } from '../functions/describeSource';

function SourceViaBadge({ source }: { source: DeploymentSource }) {
	const { attested, via, viaDetail } = describeSource(source);
	return (
		<Badge variant={attested ? 'success' : 'outline'} title={viaDetail}>
			{via}
		</Badge>
	);
}

function ExternalLink({ href, children }: { href?: string; children: React.ReactNode }) {
	return href
		? (
			<a
				href={href}
				target="_blank"
				rel="noreferrer noopener"
				className="underline"
				onClick={(event) => event.stopPropagation()}
			>
				{children}
			</a>
		)
		: <>{children}</>;
}

/** `filterable`: `list_deployments` takes `sha` (5.4.0-alpha.1+). Only a hash survives the page's search validation. */
function CommitFilter({ sha, label, filterable }: { sha: string; label: string; filterable: boolean }) {
	const navigate = useNavigate();
	if (!filterable || !isCommitSha(sha)) {
		return <span className="font-mono" title={sha}>{label}</span>;
	}
	return (
		<button
			type="button"
			className="font-mono underline decoration-dotted"
			title={`Show the deployments of commit ${sha}`}
			onClick={(event) => {
				event.stopPropagation();
				void navigate({
					to: '.',
					search: (previous: DeploymentsSearch) => ({ ...previous, sha, page: undefined }),
				});
			}}
		>
			{label}
		</button>
	);
}

export function DeploymentSourceCell(
	{ deployment, commitFilterable }: { deployment: Deployment; commitFilterable: boolean },
) {
	const built = deploymentSource(deployment);
	const source = deployment.source ? describeSource(deployment.source) : undefined;
	if (!built && !source) {
		return '—';
	}
	return (
		<span className="flex flex-col gap-0.5 text-xs">
			{built && <span className="break-all" title={built.title}>{built.label}</span>}
			{source?.sha && (
				<span className="flex flex-wrap items-center gap-1 text-muted-foreground">
					<CommitFilter sha={source.sha} label={source.shortSha!} filterable={commitFilterable} />
					{source.repository && <span className="break-all">{source.repository}</span>}
					<SourceViaBadge source={deployment.source!} />
				</span>
			)}
			{!source?.sha && deployment.source && <SourceViaBadge source={deployment.source} />}
		</span>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-xs text-muted-foreground">{label}</span>
			<span className="break-words text-sm">{children}</span>
		</div>
	);
}

export function DeploymentSourceFields({ source }: { source: DeploymentSource }) {
	const described = describeSource(source);
	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<span className="font-medium">Deployed from {source.via === 'oidc' ? 'CI' : 'a declared source'}</span>
				<SourceViaBadge source={source} />
				<span className="text-xs text-muted-foreground">{described.viaDetail}</span>
			</div>
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3">
				{described.sha && (
					<Field label="Commit">
						<span className="flex flex-wrap items-center gap-1 break-all font-mono text-xs">
							<ExternalLink href={described.commitUrl}>{described.sha}</ExternalLink>
							{described.dirty && <Badge variant="warning">uncommitted changes</Badge>}
						</span>
					</Field>
				)}
				{described.repository && <Field label="Repository">{described.repository}</Field>}
				{described.ref && (
					<Field label="Ref">
						<span className="font-mono text-xs">{described.ref}</span>
					</Field>
				)}
				{described.run && (
					<Field label="Run">
						<ExternalLink href={described.run.url}>{described.run.label}</ExternalLink>
					</Field>
				)}
				{described.actor && <Field label="Actor">{described.actor}</Field>}
				{described.environment && <Field label="Environment">{described.environment}</Field>}
				{source.via === 'oidc' && source.policy && (
					<Field label="Trust policy">
						<span className="font-mono text-xs">{source.policy}</span>
					</Field>
				)}
			</div>
		</div>
	);
}
