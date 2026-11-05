import { Loading } from '@/components/Loading';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useActionsAudience } from '@/features/instance/config/githubActions/useActionsAudience';
import { PageNotice } from '@/features/instance/config/previews/PageNotice';
import { getListRolesQueryOptions } from '@/integrations/api/instance/auth/getListRoles';
import { getListUsersQueryOptions } from '@/integrations/api/instance/auth/getListUsers';
import {
	CiDeployNames,
	CiDeploySource,
	ciDeploySourceOf,
	desiredCiDeployRecords,
	planCiDeploy,
	useSetUpCiDeploy,
} from '@/integrations/api/instance/ciDeploy/ciDeploy';
import { listOidcTrustQueryOptions } from '@/integrations/api/instance/oidcTrust/oidcTrust';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DeployStatus } from './DeployStatus';
import { DeployWorkflowInstructions } from './DeployWorkflowInstructions';
import { SetUpDeploysForm } from './SetUpDeploysForm';
import { SetupOutcome, SetupOutcomeState } from './SetupOutcome';

const NO_AUDIENCE = "Studio doesn't know this cluster's operations URL, which GitHub Actions has to request its token"
	+ ' for.';

export function ApplicationDeploys({ app, names }: { app: string; names: CiDeployNames }) {
	const instanceParams = useInstanceClientIdParams();
	const { entityId, instanceClient } = instanceParams;
	const queryClient = useQueryClient();
	const { audience, pending: audiencePending } = useActionsAudience(entityId);
	const policies = useQuery(listOidcTrustQueryOptions(instanceParams));
	const roles = useQuery(getListRolesQueryOptions(instanceParams));
	const users = useQuery(getListUsersQueryOptions(instanceParams));
	const { mutateAsync: setUp, isPending } = useSetUpCiDeploy();
	const [outcome, setOutcome] = useState<SetupOutcomeState>();

	if (!policies.data || !roles.data || !users.data) {
		return policies.isError || roles.isError || users.isError
			? <PageNotice>This cluster's trust policies, roles and users could not be read.</PageNotice>
			: <Loading text="Loading..." />;
	}

	const run = async (source: CiDeploySource, policyAudience: string) => {
		setOutcome(undefined);
		try {
			const desired = desiredCiDeployRecords({ app, names, audience: policyAudience, source });
			setOutcome({ result: await setUp({ instanceClient, desired }) });
		} catch (error) {
			setOutcome({ error });
		} finally {
			// Refetched on failure too: whatever was created before it stopped is what the page has to show.
			await Promise.all(
				['list_oidc_trust', 'list_roles', 'list_users'].map((operation) =>
					queryClient.invalidateQueries({ queryKey: [entityId, operation] })
				),
			);
		}
	};

	const existing = { policies: policies.data, roles: roles.data, users: users.data };
	const policy = policies.data.find((candidate) => candidate.id === names.policy);
	const outcomeAlert = outcome && <SetupOutcome outcome={outcome} />;

	if (!policy) {
		if (!audience) {
			return audiencePending ? <Loading text="Loading..." /> : (
				<Alert variant="destructive">
					<AlertDescription>{NO_AUDIENCE} Deploys from GitHub can't be set up here.</AlertDescription>
				</Alert>
			);
		}
		return (
			<div className="flex flex-col gap-4">
				{outcomeAlert}
				<SetUpDeploysForm audience={audience} pending={isPending} onSubmit={(source) => void run(source, audience)} />
			</div>
		);
	}

	const source = ciDeploySourceOf(policy);
	// Without the cluster's URL the stored audience stands in, so everything else can still be checked.
	const plan = source
		&& planCiDeploy(existing, desiredCiDeployRecords({ app, names, audience: audience ?? policy.audience, source }));
	const problems = [
		...(source
			? []
			: [
				`Trust policy "${names.policy}" isn't one Studio can check or write a workflow for: it has to pin a repository`
				+ ' id, a workflow file on a branch and an environment, named with letters, numbers, ".", "_", "-" and "/".'
				+ ' Manage it with the harper CLI, or drop it on the Trust Policies page to set it up here.',
			]),
		...(plan ? plan.conflicts : []),
		...(policy.invalid_reason ? [`Trust policy "${names.policy}" ${policy.invalid_reason}.`] : []),
		...(!audience && !audiencePending ? [`${NO_AUDIENCE} Its audience could not be checked.`] : []),
	];
	const missing = [
		...(plan?.role === 'create' ? [`Role "${names.role}" is missing.`] : []),
		...(plan?.user === 'create' ? [`User "${names.user}" is missing.`] : []),
	];
	const finishable = plan && plan.conflicts.length === 0 && missing.length > 0 ? source : undefined;

	return (
		<div className="flex flex-col gap-4">
			{outcomeAlert}
			<DeployStatus
				app={app}
				names={names}
				policy={policy}
				source={source}
				problems={problems}
				missing={missing}
				finishing={isPending}
				onFinish={finishable && (() => void run(finishable, policy.audience))}
			/>
			{source && <DeployWorkflowInstructions app={app} source={source} audience={policy.audience} />}
		</div>
	);
}
