import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { APIDirectoryEntry, getComponentsQueryOptions } from '@/integrations/api/instance/applications/getComponents';
import {
	previewableApplications,
	PREVIEWS_MIN_VERSION,
	supportsPreviews,
} from '@/integrations/api/instance/previews/previews';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { RefreshCwIcon } from 'lucide-react';
import { useCallback } from 'react';
import { ApplicationPreviews } from './ApplicationPreviews';
import { PageNotice } from './PageNotice';
import { PreviewsSearch } from './previewsSearch';

export function ConfigPreviewsIndex() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	const { entityId } = instanceParams;
	const canManage = useInstanceManagePermission();
	const { project }: PreviewsSearch = useSearch({ strict: false });
	// The nav and the Application menu hide this page below 5.4, but a bookmark still lands here.
	const { data: registrationInfo, isError: isVersionError } = useQuery(
		getRegistrationInfoQueryOptions(instanceParams),
	);
	const supported = registrationInfo === undefined ? undefined : supportsPreviews(registrationInfo.version);
	const { data: tree, isError: treeFailed, isFetching, isPending, refetch } = useQuery(
		getComponentsQueryOptions({ ...instanceParams, enabled: canManage && supported === true }),
	);

	const refresh = useCallback(
		() =>
			Promise.all([
				refetch(),
				queryClient.invalidateQueries({ queryKey: [entityId, 'get_preview_policy'] }),
				queryClient.invalidateQueries({ queryKey: [entityId, 'list_secrets'] }),
			]),
		[entityId, queryClient, refetch],
	);
	const onRefreshClick = useRefreshClick(refresh);

	if (!canManage) {
		return <PageNotice>Only super users can view or change previews.</PageNotice>;
	}
	if (supported === undefined) {
		return isVersionError
			? <PageNotice>This instance's Harper version could not be read, so its previews are not shown.</PageNotice>
			: <Loading text="Loading..." />;
	}
	if (!supported) {
		return (
			<PageNotice>
				PR previews need Harper {PREVIEWS_MIN_VERSION} or later. This instance runs {registrationInfo?.version}.
			</PageNotice>
		);
	}

	const applications = previewableApplications(tree);
	const selectable = project && !applications.includes(project) ? [project, ...applications] : applications;
	const isPreview = tree?.entries.some((entry) => entry.name === project && (entry as APIDirectoryEntry).preview);

	return (
		<div className="flex flex-col gap-4 px-4 md:px-0">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="max-w-2xl space-y-1">
					<h2 className="text-lg font-semibold">Previews</h2>
					<p className="text-sm text-muted-foreground">
						Each open pull request of an application runs at its own URL on this cluster, deployed by GitHub Actions
						with no secret stored in GitHub, and is removed when the pull request closes.
					</p>
				</div>
				<Button variant="defaultOutline" onClick={onRefreshClick} disabled={isFetching}>
					<RefreshCwIcon />
					<span className="hidden lg:inline-block">Refresh</span>
				</Button>
			</div>

			<Select
				value={project ?? ''}
				onValueChange={(next) => void navigate({ to: '.', search: { project: next } })}
			>
				<SelectTrigger className="w-full max-w-sm" aria-label="Application">
					<SelectValue placeholder="Choose an application" />
				</SelectTrigger>
				<SelectContent>
					{selectable.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
				</SelectContent>
			</Select>

			{!project
				? <PageNotice>Choose an application to see its previews.</PageNotice>
				: isPending
				? <Loading text="Loading..." />
				: isPreview
				? <PageNotice>{project} is itself a preview, so it has no previews of its own.</PageNotice>
				: <ApplicationPreviews key={project} app={project} tree={tree} treeFailed={treeFailed} />}
		</div>
	);
}
