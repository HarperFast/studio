import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { Button } from '@/components/ui/button';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { getDeploymentsQueryOptions } from '@/integrations/api/instance/deployments/listDeployments';
import { Deployment } from '@/integrations/api/instance/deployments/types';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Row } from '@tanstack/react-table';
import { RefreshCwIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { deploymentColumns } from './constants/tableDefinition';
import { DeploymentDetailModal } from './modals/DeploymentDetailModal';

export function ConfigDeploymentsIndex() {
	const navigate = useNavigate();
	const canManage = useInstanceManagePermission();
	const { deploymentId }: { deploymentId?: string } = useParams({ strict: false });
	const instanceParams = useInstanceClientIdParams();

	const { data, isFetching, isRefetching, refetch, error } = useQuery(
		getDeploymentsQueryOptions({ ...instanceParams, limit: 100, enabled: canManage, pollWhileOpen: true }),
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

	return (
		<>
			<SimpleBrowseDataTable<Deployment, unknown>
				data={deployments}
				isFetching={isFetching || isRefetching}
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
			{!error && !isFetching && deployments.length === 0 && (
				<div className="mt-2 text-sm text-muted-foreground">No deployments yet.</div>
			)}
			{!!deploymentId && (
				<DeploymentDetailModal deploymentId={deploymentId} isModalOpen={true} closeModal={closeModal} />
			)}
		</>
	);
}
