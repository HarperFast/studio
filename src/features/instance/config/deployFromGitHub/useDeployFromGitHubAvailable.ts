import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { APIDirectoryEntry, getComponentsQueryOptions } from '@/integrations/api/instance/applications/getComponents';
import { supportsCiDeploy } from '@/integrations/api/instance/ciDeploy/ciDeploy';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { useQuery } from '@tanstack/react-query';

/** Whether to offer it: to a super user, on a Harper whose allowlist can grant a deploy. An unreadable version offers none. */
function useDeployFromGitHubAvailable(): boolean {
	const params = useInstanceClientIdParams();
	const canManage = useInstanceManagePermission();
	const { data } = useQuery({ ...getRegistrationInfoQueryOptions(params), enabled: canManage });
	return canManage && supportsCiDeploy(data?.version);
}

/** The application the Application menu sets deploys up for. A preview is deployed by its own workflow, so none. */
export function useDeployFromGitHubProject(project: string | undefined): string | undefined {
	const params = useInstanceClientIdParams();
	const available = useDeployFromGitHubAvailable();
	const { data: tree } = useQuery({ ...getComponentsQueryOptions(params), enabled: available && !!project });
	if (!available || !project || !tree) {
		return undefined;
	}
	const entry = tree.entries.find((candidate) => candidate.name === project) as APIDirectoryEntry | undefined;
	return entry?.preview ? undefined : project;
}
