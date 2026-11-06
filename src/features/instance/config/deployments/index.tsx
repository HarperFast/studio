import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import {
	supportsDeployments,
	supportsReleaseTracking,
	supportsStagedDeployments,
} from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { getDeploymentsQueryOptions } from '@/integrations/api/instance/deployments/listDeployments';
import { DeploymentStatus } from '@/integrations/api/instance/deployments/types';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { Row } from '@/lib/table';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ChevronLeftIcon, ChevronRightIcon, RefreshCwIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ComponentReleasesPanel } from './components/ComponentReleases';
import { DEPLOYMENT_STATUS_LABEL } from './components/deploymentStatusBadge';
import { deploymentColumns, DeploymentRow } from './constants/tableDefinition';
import { DEPLOYMENTS_PAGE_SIZE, DeploymentsSearch, filterableStatuses } from './deploymentsSearch';
import { useRetryReleases } from './hooks/useComponentReleases';
import { useStagedReleases } from './hooks/useStagedReleases';
import { DeploymentDetailModal } from './modals/DeploymentDetailModal';

const ALL_STATUSES = 'all';

export function ConfigDeploymentsIndex() {
	const navigate = useNavigate();
	const canManage = useInstanceManagePermission();
	const { deploymentId }: { deploymentId?: string } = useParams({ strict: false });
	const { project, status: requestedStatus, sha: requestedSha, page = 1 }: DeploymentsSearch = useSearch({
		strict: false,
	});
	const instanceParams = useInstanceClientIdParams();
	// The nav hides this page below Harper 5.1, but a bookmark or back-navigation still lands here.
	const { data: registrationInfo, isError: registrationFailed } = useQuery(
		getRegistrationInfoQueryOptions(instanceParams),
	);
	const versionKnown = registrationInfo !== undefined;
	const versionUnavailable = !versionKnown && registrationFailed;
	const deploymentsAvailable = supportsDeployments(registrationInfo?.version);
	const statuses = filterableStatuses(supportsStagedDeployments(registrationInfo?.version), registrationInfo?.version);
	const status = requestedStatus && statuses.includes(requestedStatus) ? requestedStatus : undefined;
	const unsupportedStatus = versionKnown && !!requestedStatus && !status;
	// An older Harper ignores `sha` and would list every deployment under a commit filter.
	const releaseTracking = supportsReleaseTracking(registrationInfo?.version);
	const sha = releaseTracking ? requestedSha : undefined;
	const unsupportedSha = versionKnown && !!requestedSha && !sha;
	useEffect(() => {
		// Otherwise the URL would keep claiming a filter the list is not applying.
		if (unsupportedStatus || unsupportedSha) {
			void navigate({
				to: '.',
				search: (previous: DeploymentsSearch) => ({
					...previous,
					...(unsupportedStatus && { status: undefined }),
					...(unsupportedSha && { sha: undefined }),
				}),
				replace: true,
			});
		}
	}, [unsupportedStatus, unsupportedSha, navigate]);

	const { data, isFetching, isRefetching, refetch, error } = useQuery(
		getDeploymentsQueryOptions({
			...instanceParams,
			project,
			status,
			sha,
			limit: DEPLOYMENTS_PAGE_SIZE,
			offset: (page - 1) * DEPLOYMENTS_PAGE_SIZE,
			enabled: canManage && deploymentsAvailable,
			pollWhileOpen: true,
		}),
	);
	const deployments = useMemo(() => data?.deployments ?? [], [data]);
	const releases = useStagedReleases(deployments);
	const rows = useMemo<DeploymentRow[]>(
		() =>
			deployments.map((deployment) =>
				releases.has(deployment.deployment_id)
					? { ...deployment, release: releases.get(deployment.deployment_id) }
					: deployment
			),
		[deployments, releases],
	);
	const total = data?.total ?? 0;
	const firstShown = total === 0 ? 0 : (page - 1) * DEPLOYMENTS_PAGE_SIZE + 1;
	const lastShown = Math.min(total, (page - 1) * DEPLOYMENTS_PAGE_SIZE + deployments.length);
	const filtered = !!project || !!status || !!sha;
	const columns = useMemo(() => deploymentColumns({ commitFilterable: releaseTracking }), [releaseTracking]);

	const setSearch = useCallback(
		(patch: DeploymentsSearch) => {
			void navigate({ to: '.', search: (previous: DeploymentsSearch) => ({ ...previous, ...patch }) });
		},
		[navigate],
	);
	const applyProject = useCallback(
		(value: string) => {
			const next = value.trim() || undefined;
			if (next !== project) {
				setSearch({ project: next, page: undefined });
			}
		},
		[project, setSearch],
	);

	const onSelect = useCallback(
		(next: string | undefined) => {
			const parts = [deploymentId ? '..' : '', next].filter(Boolean);
			void navigate({ to: parts.join('/') || '.', search: true });
		},
		[deploymentId, navigate],
	);
	const onRowClick = useCallback((row: Row<DeploymentRow>) => onSelect(row.original.deployment_id), [onSelect]);
	const closeModal = useCallback(() => onSelect(undefined), [onSelect]);
	const retryReleases = useRetryReleases(project);
	const onRefreshClick = useRefreshClick(
		useCallback(() => (releaseTracking ? retryReleases() : refetch()), [releaseTracking, retryReleases, refetch]),
	);
	const projectInput = useRef<HTMLInputElement>(null);
	useEffect(() => {
		// Follows a filter set from outside the field, such as the editor's link, without remounting it.
		if (projectInput.current && projectInput.current.value.trim() !== (project ?? '')) {
			projectInput.current.value = project ?? '';
		}
	}, [project]);

	if (!canManage) {
		return (
			<div className="p-2 text-sm text-muted-foreground">
				Viewing deployments requires super-user permissions on this instance.
			</div>
		);
	}

	if (versionKnown && !deploymentsAvailable) {
		return (
			<div className="p-2 text-sm text-muted-foreground">
				Deployment history needs Harper 5.1 or later on this instance.
			</div>
		);
	}

	return (
		<>
			{project && releaseTracking && <ComponentReleasesPanel project={project} />}
			<SimpleBrowseDataTable<DeploymentRow>
				data={rows}
				isFetching={isFetching || isRefetching || (!versionKnown && !versionUnavailable)}
				columns={columns}
				onRowClick={onRowClick}
			>
				<form
					className="flex grow flex-wrap items-center gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						applyProject(String(new FormData(event.currentTarget).get('project') ?? ''));
					}}
				>
					<Input
						ref={projectInput}
						name="project"
						aria-label="Component"
						placeholder="Component (Enter to filter)"
						defaultValue={project ?? ''}
						className="w-56"
					/>
					<Select
						value={status ?? ALL_STATUSES}
						onValueChange={(value) =>
							setSearch({ status: value === ALL_STATUSES ? undefined : value as DeploymentStatus, page: undefined })}
					>
						<SelectTrigger aria-label="Status" className="w-44">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
							{statuses.map((candidate) => (
								<SelectItem key={candidate} value={candidate}>{DEPLOYMENT_STATUS_LABEL[candidate]}</SelectItem>
							))}
						</SelectContent>
					</Select>
					{sha && (
						<Button
							type="button"
							variant="ghostOutline"
							size="sm"
							title={`Commit ${sha}`}
							aria-label={`Clear the commit filter ${sha.slice(0, 7)}`}
							onClick={() => setSearch({ sha: undefined, page: undefined })}
						>
							<span className="font-mono">Commit {sha.slice(0, 7)}</span> <XIcon />
						</Button>
					)}
				</form>
				<Button
					variant="defaultOutline"
					onClick={onRefreshClick}
					accessKey="r"
					disabled={isFetching || isRefetching}
				>
					<RefreshCwIcon />{' '}
					<span className="hidden lg:inline-block">
						<u>R</u>efresh
					</span>
				</Button>
			</SimpleBrowseDataTable>
			{(error || versionUnavailable) && (
				<div className="mt-2 text-sm text-muted-foreground">
					Could not load deployments. This instance may not support deployment history.
				</div>
			)}
			{!error && !isFetching && versionKnown && deployments.length === 0 && (
				<div className="mt-2 text-sm text-muted-foreground">
					{total > 0
						? (
							<>
								Nothing on this page.{' '}
								<button
									type="button"
									className="underline"
									onClick={() => setSearch({ page: undefined })}
								>
									Go to the first page
								</button>
							</>
						)
						: sha && sha.length < 40
						? 'No deployments match these filters. A commit filter matches only the full SHA.'
						: filtered
						? 'No deployments match these filters.'
						: 'No deployments yet.'}
				</div>
			)}
			{deployments.length > 0 && (
				<div className="mt-2 flex items-center justify-end gap-2 text-sm text-muted-foreground">
					<span>
						{firstShown}–{lastShown} of {total}
					</span>
					<Button
						variant="ghostOutline"
						size="sm"
						aria-label="Previous page"
						disabled={page <= 1}
						onClick={() => setSearch({ page: page - 1 > 1 ? page - 1 : undefined })}
					>
						<ChevronLeftIcon />
					</Button>
					<Button
						variant="ghostOutline"
						size="sm"
						aria-label="Next page"
						disabled={page * DEPLOYMENTS_PAGE_SIZE >= total}
						onClick={() => setSearch({ page: page + 1 })}
					>
						<ChevronRightIcon />
					</Button>
				</div>
			)}
			{!!deploymentId && (
				<DeploymentDetailModal deploymentId={deploymentId} isModalOpen={true} closeModal={closeModal} />
			)}
		</>
	);
}
