import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useCallback } from 'react';

export function deploymentRecordPath(
	params: { clusterId?: string; instanceId?: string; organizationId?: string },
	deploymentId: string,
): string {
	return buildAbsoluteLinkToPage(params, `config/deployments/${encodeURIComponent(deploymentId)}`);
}

/** A toast action that opens a deployment's record, for a deploy whose result or failure named one. */
export function useDeploymentRecordAction() {
	const navigate = useNavigate();
	const params: { clusterId?: string; instanceId?: string; organizationId?: string } = useParams({ strict: false });
	return useCallback(
		(deploymentId: string | undefined) =>
			deploymentId
				? { label: 'View record', onClick: () => void navigate({ to: deploymentRecordPath(params, deploymentId) }) }
				: undefined,
		[navigate, params],
	);
}
