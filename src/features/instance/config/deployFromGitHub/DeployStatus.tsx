import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CI_DEPLOY_OPERATIONS, CiDeployNames, CiDeploySource } from '@/integrations/api/instance/ciDeploy/ciDeploy';
import { OidcTrustPolicy } from '@/integrations/api/instance/oidcTrust/oidcTrust';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { Link, useParams } from '@tanstack/react-router';
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

const operationList = (operations: string[]) => new Intl.ListFormat('en', { type: 'conjunction' }).format(operations);

export function DeployStatus({
	app,
	names,
	policy,
	source,
	problems,
	missing,
	finishing,
	onFinish,
}: {
	app: string;
	names: CiDeployNames;
	policy: OidcTrustPolicy;
	/** Undefined when the policy's claims aren't the shape Studio and the CLI write. */
	source: CiDeploySource | undefined;
	problems: string[];
	/** Records setup would create, which only a damaged or interrupted setup lacks. */
	missing: string[];
	finishing: boolean;
	onFinish: (() => void) | undefined;
}) {
	const routeParams: { clusterId?: string; instanceId?: string; organizationId?: string } = useParams({
		strict: false,
	});
	const healthy = problems.length === 0 && missing.length === 0;
	return (
		<section className="flex flex-col gap-3 rounded-md border p-4" aria-label="Deploy status">
			<div className="flex flex-wrap items-center gap-2">
				<h3 className="text-sm font-semibold">Status</h3>
				{healthy ? <Badge variant="success">Set up</Badge> : <Badge variant="destructive">Needs attention</Badge>}
			</div>
			<dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
				<Field label="Repository">
					{source
						? (
							<a
								className="underline"
								href={`https://github.com/${source.repository}`}
								target="_blank"
								rel="noreferrer"
							>
								{source.repository}
							</a>
						)
						: '—'}
				</Field>
				<Field label="Workflow file">{source?.workflow ?? '—'}</Field>
				<Field label="Branch">{source?.branch ?? '—'}</Field>
				<Field label="Environment">{source?.environment ?? '—'}</Field>
				<Field label="Acts as">{policy.user}</Field>
			</dl>
			{problems.length > 0 && (
				<Alert variant="destructive">
					<TriangleAlertIcon />
					<AlertTitle>GitHub Actions can't deploy with this setup</AlertTitle>
					<AlertDescription>
						<ul className="list-disc pl-4">
							{problems.map((problem) => <li key={problem}>{problem}</li>)}
						</ul>
					</AlertDescription>
				</Alert>
			)}
			{missing.length > 0 && (
				<div>
					<p className="mb-2 text-sm text-muted-foreground">
						{missing.join(' ')} Setting up again creates only what is missing.
					</p>
					{onFinish && (
						<Button size="sm" variant="defaultOutline" disabled={finishing} onClick={onFinish}>
							Finish setup
						</Button>
					)}
				</div>
			)}
			<p className="text-sm text-muted-foreground">
				Runs act as {names.user}, which can run {operationList(CI_DEPLOY_OPERATIONS)}{' '}
				for any application on this cluster, not only {app}. To stop them, drop the policy on{' '}
				<Link className="underline" to={buildAbsoluteLinkToPage(routeParams, 'config/trust-policies')}>
					Trust Policies
				</Link>
				. A token already issued lasts an hour; deactivating {names.user} (<code className="font-mono">
					alter_user
				</code>{' '}
				with <code className="font-mono">active: false</code>) also stops that one.
			</p>
		</section>
	);
}
