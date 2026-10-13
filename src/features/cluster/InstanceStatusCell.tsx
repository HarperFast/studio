import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isOperationsProxyRefused, isStoppedOrTransitioning } from '@/components/ui/utils/badgeStatus';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useIsOnScreen } from '@/hooks/useIsOnScreen';
import { useOrganizationClusterInstancePermissions } from '@/hooks/usePermissions';
import { Instance } from '@/integrations/api/api.patch';
import {
	getStatusQueryOptions,
	getSystemStatusById,
	predatesGetStatus,
	supportsGetStatus,
} from '@/integrations/api/instance/status/getStatus';
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
	const [cellElement, setCellElement] = useState<HTMLDivElement | null>(null);
	// A row scrolled out of view stops polling, so a large cluster costs what is on screen rather than
	// one request per instance every 10s. The margin starts a row's fetch just before it scrolls in.
	const onScreen = useIsOnScreen(cellElement, '200px');

	// Spread the status requests out.
	useEffect(() => {
		const timer = setTimeout(() => setReady(true), index * 500);
		return () => clearTimeout(timer);
	}, [index]);

	const notProxied = isOperationsProxyRefused(instance.status);
	const statusSupported = supportsGetStatus(instance.version);
	const statusPollEnabled = ready && onScreen && canManage && !notProxied && statusSupported;
	const { data: statusResponse, isLoading, isFetching } = useQuery(
		getStatusQueryOptions(instanceParams, statusPollEnabled),
	);

	const systemStatus = getSystemStatusById(statusResponse, 'availability') || 'Unknown';
	const isAvailable = systemStatus === 'Available';
	const isUnavailable = systemStatus === 'Unavailable';

	if (!canManage) {
		return null;
	}

	// Availability and rotation are N/A while central manager refuses the instance's operations, or on
	// a Harper too old to have them. Show a muted dot rather than a stale green "Available" (cached
	// from before) or an endless spinner.
	if (notProxied || !statusSupported) {
		let label = 'Status unavailable';
		if (notProxied && isStoppedOrTransitioning(instance.status)) {
			label = 'Not running';
		} else if (!notProxied && predatesGetStatus(instance.version)) {
			label = 'Status needs Harper 4.6 or later';
		}
		return (
			<div className="flex items-center gap-2">
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="inline-block size-4 rounded-full bg-muted-foreground/40" aria-label={label} />
					</TooltipTrigger>
					<TooltipContent>{label}</TooltipContent>
				</Tooltip>
			</div>
		);
	}

	return (
		<div ref={setCellElement} className="flex items-center gap-2">
			<Tooltip>
				<TooltipTrigger asChild>
					<div className="flex items-center">
						{isLoading || !ready || ((isFetching || !onScreen) && !statusResponse)
							? (
								<>
									<LoaderCircleIcon className="animate-spin size-5 text-muted-foreground" />
									<span className="sr-only">Loading status</span>
								</>
							)
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
									type="button"
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
									type="button"
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
