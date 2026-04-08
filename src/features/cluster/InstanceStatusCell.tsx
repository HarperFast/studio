import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useOrganizationClusterInstancePermissions } from '@/hooks/usePermissions';
import { Instance } from '@/integrations/api/api.patch';
import { getStatusQueryOptions, getSystemStatusById } from '@/integrations/api/instance/status/getStatus';
import { useSetStatus } from '@/integrations/api/instance/status/setStatus';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { useQuery } from '@tanstack/react-query';
import { LoaderCircleIcon, ShieldCheckIcon, ShieldXIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

export function InstanceStatusCell(
	{ instance, index }: { readonly instance: Instance; index: number },
) {
	const { update: canManage } = useOrganizationClusterInstancePermissions();
	const operationsUrl = useMemo(() => getOperationsUrlForInstance(instance), [instance]);
	const instanceParams = useInstanceClientIdParams({
		operationsUrl,
		instanceId: instance.id,
		forceFabricConnect: true,
	});
	const { mutate: setStatus, isPending: isSettingStatus } = useSetStatus();

	const [ready, setReady] = useState(false);

	// Spread the status requests out.
	useEffect(() => {
		const timer = setTimeout(() => setReady(true), index * 500);
		return () => clearTimeout(timer);
	}, [index]);

	const { data: statusResponse, isLoading, isFetching } = useQuery(
		getStatusQueryOptions(instanceParams, ready && canManage),
	);

	const systemStatus = getSystemStatusById(statusResponse, 'availability') || 'Unknown';
	const isAvailable = systemStatus === 'Available';
	const isUnavailable = systemStatus === 'Unavailable';

	if (!canManage) {
		return null;
	}

	return (
		<div className="flex items-center gap-2">
			<Tooltip>
				<TooltipTrigger asChild>
					<div className="flex items-center">
						{isLoading || !ready || (isFetching && !statusResponse)
							? <LoaderCircleIcon className="animate-spin size-5 text-muted-foreground" />
							: (
								<Badge
									variant={isAvailable ? 'success' : isUnavailable ? 'destructive' : 'default'}
									className="size-4 rounded-full p-0"
								>
									<span className="sr-only">{isAvailable ? 'Online' : 'Offline'}</span>
								</Badge>
							)}
					</div>
				</TooltipTrigger>
				<TooltipContent>
					{isFetching && statusResponse ? 'Refreshing... ' : ''}
					{systemStatus}
				</TooltipContent>
			</Tooltip>

			{canManage && (
				<div className="flex gap-1">
					{isAvailable && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="destructiveGhost"
									size="icon"
									onClick={() => setStatus({ ...instanceParams, id: 'availability', status: 'Unavailable' })}
									disabled={isSettingStatus}
								>
									{isSettingStatus
										? <LoaderCircleIcon className="animate-spin size-4" />
										: <ShieldXIcon className="size-4" />}
								</Button>
							</TooltipTrigger>
							<TooltipContent>Bring out of rotation</TooltipContent>
						</Tooltip>
					)}
					{isUnavailable && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => setStatus({ ...instanceParams, id: 'availability', status: 'Available' })}
									disabled={isSettingStatus}
								>
									{isSettingStatus
										? <LoaderCircleIcon className="animate-spin size-4" />
										: <ShieldCheckIcon className="size-4" />}
								</Button>
							</TooltipTrigger>
							<TooltipContent>Bring back into rotation</TooltipContent>
						</Tooltip>
					)}
				</div>
			)}
		</div>
	);
}
