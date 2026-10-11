import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { Button } from '@/components/ui/button';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { supportsDeployments } from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { getDeploymentsQueryOptions } from '@/integrations/api/instance/deployments/listDeployments';
import { Deployment } from '@/integrations/api/instance/deployments/types';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { Row } from '@/lib/table';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { RefreshCwIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { deploymentColumns } from './constants/tableDefinition';
import { DeploymentDetailModal } from './modals/DeploymentDetailModal';

export function ConfigDeploymentsIndex() {
	const navigate = useNavigate();
	const canManage = useInstanceManagePermission();
	const { deploymentId }: { deploymentId?: string } = useParams({ strict: false });
	const instanceParams = useInstanceClientIdParams();
	// The nav hides this page below Harper 5.1, but a bookmark or back-navigation still lands here.
	const { data: registrationInfo } = useQuery(getRegistrationInfoQueryOptions(instanceParams));
	const versionKnown = registrationInfo !== undefined;
	const deploymentsAvailable = supportsDeployments(registrationInfo?.version);

	const { data, isFetching, isRefetching, refetch, error } = useQuery(
		getDeploymentsQueryOptions({
			...instanceParams,
			limit: 100,
			enabled: canManage && deploymentsAvailable,
			pollWhileOpen: true,
		}),
	);
	const deployments = useMemo(() => data?.deployments ?? [], [data]);

	const onSelect = useCallback(
		(next: string | undefined) => {
			const parts = [deploymentId ? '..' : '', next].filter(Boolean);
			void navigate({ to: parts.join('/') || '.' });
		},
		[deploymentId, navigate],
	);
	const onRowClick = useCallback((row: Row<Deployment>) => onSelect(row.original.deployment_id), [onSelect]);
	const closeModal = useCallback(() => onSelect(undefined), [onSelect]);
	const onRefreshClick = useRefreshClick(refetch);

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
			<SimpleBrowseDataTable<Deployment>
				data={deployments}
				isFetching={isFetching || isRefetching || !versionKnown}
				columns={deploymentColumns}
				onRowClick={onRowClick}
			>
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
			{error && (
				<div className="mt-2 text-sm text-muted-foreground">
					Could not load deployments. This instance may not support deployment history.
				</div>
			)}
			{!error && !isFetching && versionKnown && deployments.length === 0 && (
				<div className="mt-2 text-sm text-muted-foreground">No deployments yet.</div>
			)}
			{!!deploymentId && (
				<DeploymentDetailModal deploymentId={deploymentId} isModalOpen={true} closeModal={closeModal} />
			)}
		</>
	);
}
