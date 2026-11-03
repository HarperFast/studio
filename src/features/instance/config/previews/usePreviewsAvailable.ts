import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { APIDirectoryEntry, getComponentsQueryOptions } from '@/integrations/api/instance/applications/getComponents';
import { supportsPreviews } from '@/integrations/api/instance/previews/previews';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { useQuery } from '@tanstack/react-query';

/** Whether to offer previews: to a super user, on a Harper that has the operations. An unreadable version offers none. */
export function usePreviewsAvailable(): boolean {
	const params = useInstanceClientIdParams();
	const canManage = useInstanceManagePermission();
	const { data } = useQuery({ ...getRegistrationInfoQueryOptions(params), enabled: canManage });
	return canManage && supportsPreviews(data?.version);
}

/**
 * Whose previews the Application menu opens for `project`: its own, or, when `project` is itself a preview, those of
 * the application it previews, whose page lists and deletes it. A preview has no panel of its own to offer.
 */
export function usePreviewsProject(project: string | undefined): string | undefined {
	const params = useInstanceClientIdParams();
	const available = usePreviewsAvailable();
	const { data: tree } = useQuery({ ...getComponentsQueryOptions(params), enabled: available && !!project });
	if (!available || !project || !tree) {
		return undefined;
	}
	const entry = tree.entries.find((candidate) => candidate.name === project) as APIDirectoryEntry | undefined;
	return entry?.preview?.app ?? project;
}
