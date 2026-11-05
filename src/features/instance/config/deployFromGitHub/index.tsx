import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { PageNotice } from '@/features/instance/config/previews/PageNotice';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { APIDirectoryEntry, getComponentsQueryOptions } from '@/integrations/api/instance/applications/getComponents';
import { CI_DEPLOY_MIN_VERSION, ciDeployNames, supportsCiDeploy } from '@/integrations/api/instance/ciDeploy/ciDeploy';
import { previewableApplications } from '@/integrations/api/instance/previews/previews';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { RefreshCwIcon } from 'lucide-react';
import { FormEvent, useCallback } from 'react';
import { ApplicationDeploys } from './ApplicationDeploys';
import { DeployFromGitHubSearch } from './deployFromGitHubSearch';

export function ConfigDeployFromGitHubIndex() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	const { entityId } = instanceParams;
	const canManage = useInstanceManagePermission();
	const { project }: DeployFromGitHubSearch = useSearch({ strict: false });
	// The nav and the Application menu hide this page below the floor, but a bookmark still lands here.
	const { data: registrationInfo, isError: isVersionError } = useQuery(
		getRegistrationInfoQueryOptions(instanceParams),
	);
	const supported = registrationInfo === undefined ? undefined : supportsCiDeploy(registrationInfo.version);
	const { data: tree, isFetching, isPending, refetch } = useQuery(
		getComponentsQueryOptions({ ...instanceParams, enabled: canManage && supported === true }),
	);

	const refresh = useCallback(
		() =>
			Promise.all([
				refetch(),
				...['list_oidc_trust', 'list_roles', 'list_users'].map((operation) =>
					queryClient.invalidateQueries({ queryKey: [entityId, operation] })
				),
			]),
		[entityId, queryClient, refetch],
	);
	const onRefreshClick = useRefreshClick(refresh);
	const open = (next: string) => void navigate({ to: '.', search: { project: next } });
	const onNewApplication = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const name = String(new FormData(event.currentTarget).get('application') ?? '').trim();
		if (name) {
			open(name);
		}
	};

	if (!canManage) {
		return <PageNotice>Only super users can set up deploys from GitHub.</PageNotice>;
	}
	if (supported === undefined) {
		return isVersionError
			? <PageNotice>This instance's Harper version could not be read, so deploys from GitHub are not shown.</PageNotice>
			: <Loading text="Loading..." />;
	}
	if (!supported) {
		return (
			<PageNotice>
				Deploys from GitHub need Harper {CI_DEPLOY_MIN_VERSION} or later. This instance runs{' '}
				{registrationInfo?.version}.
			</PageNotice>
		);
	}

	const applications = previewableApplications(tree);
	const selectable = project && !applications.includes(project) ? [project, ...applications] : applications;
	const isPreview = tree?.entries.some((entry) => entry.name === project && (entry as APIDirectoryEntry).preview);
	const names = project ? ciDeployNames(project) : undefined;

	return (
		<div className="flex flex-col gap-4 px-4 md:px-0">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="max-w-2xl space-y-1">
					<h2 className="text-lg font-semibold">Deploy from GitHub</h2>
					<p className="text-sm text-muted-foreground">
						Each merge to a branch deploys an application to this cluster from GitHub Actions. The workflow signs in
						with its OIDC token under a trust policy, so GitHub stores no Harper credential.
					</p>
				</div>
				<Button variant="defaultOutline" onClick={onRefreshClick} disabled={isFetching}>
					<RefreshCwIcon />
					<span className="hidden lg:inline-block">Refresh</span>
				</Button>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<Select value={project ?? ''} onValueChange={open}>
					<SelectTrigger className="w-full max-w-sm" aria-label="Application">
						<SelectValue placeholder="Choose an application" />
					</SelectTrigger>
					<SelectContent>
						{selectable.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
					</SelectContent>
				</Select>
				<form className="flex items-center gap-2" aria-label="New application" onSubmit={onNewApplication}>
					<Input
						name="application"
						aria-label="New application name"
						placeholder="Or one not deployed yet"
						autoComplete="off"
						className="w-56"
					/>
					<Button type="submit" variant="defaultOutline">Open</Button>
				</form>
			</div>

			{!project
				? <PageNotice>Choose an application, or name one that isn't on this cluster yet.</PageNotice>
				: isPending
				? <Loading text="Loading..." />
				: isPreview
				? <PageNotice>{project} is a preview, which its application's preview workflow deploys.</PageNotice>
				: !names
				? (
					<PageNotice>
						{project}{' '}
						can't be set up here: an application's name is letters, numbers, "-" and "_", short enough for a trust
						policy id of 128 characters.
					</PageNotice>
				)
				: <ApplicationDeploys key={project} app={project} names={names} />}
		</div>
	);
}
