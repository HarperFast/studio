import type { EntityMenuItem } from '@/components/ui/entityMenu';
import { isStoppedOrTransitioning } from '@/components/ui/utils/badgeStatus';
import { defaultInstanceRoute } from '@/config/constants';
import { useInstanceClient, useInstanceClientIdParams } from '@/config/useInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { signOutOfInstance } from '@/features/cluster/signOutOfInstance';
import { calculateInstanceFQDN } from '@/features/clusters/upsert/lib/calculateInstanceFQDN';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useInstanceContainerOps } from '@/hooks/useInstanceContainerOps';
import { useOrganizationClusterInstancePermissions } from '@/hooks/usePermissions';
import { Instance } from '@/integrations/api/api.patch';
import { getStatusQueryOptions, getSystemStatusById } from '@/integrations/api/instance/status/getStatus';
import { useSetStatus } from '@/integrations/api/instance/status/setStatus';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { useQuery } from '@tanstack/react-query';
import {
	ClipboardIcon,
	LifeBuoyIcon,
	LogInIcon,
	LogOutIcon,
	PlayIcon,
	RotateCwIcon,
	ServerIcon,
	ShieldCheckIcon,
	ShieldXIcon,
	SquareIcon,
} from 'lucide-react';
import { useCallback, useMemo } from 'react';

const READY_STATUSES = ['CLONE_READY', 'RUNNING', 'UPDATED', 'PENDING_UPGRADE'];

/**
 * The shared action list for an instance, rendered both as the row's right-click
 * context menu and its "…" dropdown. Mirrors the inline actions in
 * {@link InstanceLogInCell} (connect / sign in / sign out) and
 * {@link InstanceStatusCell} (rotation), plus copy helpers.
 *
 * `enabled` gates the availability status query so it only runs while a menu is
 * open — wrapping every row otherwise fires a status request per instance.
 */
export function useInstanceMenuItems(
	instance: Instance,
	isSelfManaged: boolean,
	enabled: boolean,
): EntityMenuItem[] {
	const { user: instanceUser } = useInstanceAuth(instance.id);
	const operationsUrl = useMemo(() => getOperationsUrlForInstance(instance), [instance]);
	const instanceClient = useInstanceClient({ operationsUrl });
	const { update: canManage } = useOrganizationClusterInstancePermissions();
	const isFabricConnect = authStore.checkForFabricConnect(instance.id);

	const statusParams = useInstanceClientIdParams({ operationsUrl, instanceId: instance.id, forceFabricConnect: true });
	const { data: statusResponse } = useQuery(
		getStatusQueryOptions(statusParams, enabled && canManage && !isStoppedOrTransitioning(instance.status)),
	);
	const systemStatus = getSystemStatusById(statusResponse, 'availability') || 'Unknown';
	const isAvailable = systemStatus === 'Available';
	const isUnavailable = systemStatus === 'Unavailable';
	const { mutate: setStatus, isPending: isSettingStatus } = useSetStatus();
	const { run: runContainerOp, isPending: isContainerOpPending } = useInstanceContainerOps(instance);

	const fqdn = instance.instanceFqdn;
	const apiUrl = calculateInstanceFQDN({
		secure: instance.operationsApiSecure ? 'true' : 'false',
		port: instance.operationsApiPort,
		fqdn: instance.instanceFqdn,
	});
	const [onCopyFqdn, onCopyApiUrl] = useCopyToClipboard(fqdn ?? '', apiUrl);

	const onSignOut = useCallback(async () => {
		await signOutOfInstance({ instance, instanceClient });
	}, [instance, instanceClient]);

	const isReady = !!instance.status && READY_STATUSES.includes(instance.status);
	const isDirectlyLoggedIn = !!instanceUser && !isFabricConnect;
	const hasAuth = isReady;
	const hasCopy = !!fqdn;
	const hasRotation = canManage && isReady && (isAvailable || isUnavailable);

	// Container lifecycle ops (stop/start/restart) — distinct from the proxied Harper "restart".
	// Only offered from a settled RUNNING/STOPPED state; hidden mid-transition (the instances poll
	// reveals the resting state and the actions reappear).
	const isRunning = instance.status === 'RUNNING';
	const isStopped = instance.status === 'STOPPED';
	const hasContainerOps = canManage && (isRunning || isStopped);

	const actions: EntityMenuItem[] = [
		hasAuth && isDirectlyLoggedIn && {
			key: 'direct-connect',
			to: `../instance/${instance.id}${defaultInstanceRoute}`,
			icon: <ServerIcon className="text-green" />,
			label: 'Direct Connect',
		},
		hasAuth && isDirectlyLoggedIn && {
			key: 'direct-sign-out',
			onClick: onSignOut,
			variant: 'destructive' as const,
			icon: <LogOutIcon />,
			label: 'Direct Sign Out',
		},
		hasAuth && !isDirectlyLoggedIn && canManage && !isSelfManaged && {
			key: 'fabric-connect',
			to: `../instance/${instance.id}${defaultInstanceRoute}`,
			icon: <ServerIcon className="text-green" />,
			label: 'Fabric Connect',
		},
		hasAuth && !isDirectlyLoggedIn && {
			key: 'direct-sign-in',
			to: `../instance/${instance.id}/sign-in`,
			icon: <LogInIcon />,
			label: 'Direct Sign In',
		},

		hasAuth && hasCopy && { type: 'separator' as const, key: 'copy-sep' },
		hasCopy && { key: 'copy-fqdn', onClick: onCopyFqdn, icon: <ClipboardIcon />, label: 'Copy Instance FQDN' },
		hasCopy && { key: 'copy-api', onClick: onCopyApiUrl, icon: <ClipboardIcon />, label: 'Copy API URL' },

		(hasAuth || hasCopy) && hasRotation && { type: 'separator' as const, key: 'rotation-sep' },
		hasRotation && isAvailable && {
			key: 'out-of-rotation',
			variant: 'destructive' as const,
			disabled: isSettingStatus,
			onClick: () => setStatus({ ...statusParams, id: 'availability', status: 'Unavailable' }),
			icon: <ShieldXIcon />,
			label: 'Bring out of rotation',
		},
		hasRotation && isUnavailable && {
			key: 'into-rotation',
			disabled: isSettingStatus,
			onClick: () => setStatus({ ...statusParams, id: 'availability', status: 'Available' }),
			icon: <ShieldCheckIcon />,
			label: 'Bring back into rotation',
		},

		(hasAuth || hasCopy || hasRotation) && hasContainerOps && { type: 'separator' as const, key: 'container-sep' },
		hasContainerOps && {
			type: 'label' as const,
			key: 'container-label',
			className: 'text-gray-600 text-xs',
			label: 'Container',
		},
		hasContainerOps && isStopped && {
			key: 'container-start',
			disabled: isContainerOpPending,
			onClick: () => void runContainerOp('start', { safeMode: false }),
			icon: <PlayIcon />,
			label: 'Start',
		},
		hasContainerOps && isStopped && {
			key: 'container-start-safe',
			disabled: isContainerOpPending,
			onClick: () => void runContainerOp('start', { safeMode: true, label: 'Starting in safe mode' }),
			icon: <LifeBuoyIcon />,
			label: 'Start in safe mode',
		},
		hasContainerOps && isRunning && {
			key: 'container-restart',
			disabled: isContainerOpPending,
			onClick: () => void runContainerOp('restart', { safeMode: false }),
			icon: <RotateCwIcon />,
			label: 'Restart',
		},
		hasContainerOps && isRunning && {
			key: 'container-restart-safe',
			disabled: isContainerOpPending,
			onClick: () => void runContainerOp('restart', { safeMode: true, label: 'Restarting in safe mode' }),
			icon: <LifeBuoyIcon />,
			label: 'Restart in safe mode',
		},
		hasContainerOps && isRunning && {
			key: 'container-stop',
			variant: 'destructive' as const,
			disabled: isContainerOpPending,
			onClick: () => void runContainerOp('stop'),
			icon: <SquareIcon />,
			label: 'Stop',
		},
	].filter(excludeFalsy);

	if (!actions.length) {
		return [];
	}

	return [
		{ type: 'label', key: 'label', className: 'text-gray-600 text-xs', label: 'Options' },
		{ type: 'separator', key: 'label-sep' },
		...actions,
	];
}
