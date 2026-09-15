import { Button } from '@/components/ui/button';
import { isStoppedOrTransitioning } from '@/components/ui/utils/badgeStatus';
import { useInstanceClient } from '@/config/useInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { signOutOfInstance } from '@/features/cluster/signOutOfInstance';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useOrganizationClusterInstancePermissions } from '@/hooks/usePermissions';
import { Instance } from '@/integrations/api/api.patch';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { Link, useParams } from '@tanstack/react-router';
import { LoaderCircleIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';

export function InstanceLogInCell(
	{ isSelfManaged, instance }: { readonly isSelfManaged: boolean; readonly instance: Instance },
) {
	const { user: instanceUser, isLoading: instanceAuthIsLoading } = useInstanceAuth(instance.id);
	const { organizationId, clusterId }: { organizationId?: string; clusterId?: string } = useParams({ strict: false });
	const instanceHref = buildAbsoluteLinkToPage({ organizationId, clusterId, instanceId: instance.id });
	const signInHref = buildAbsoluteLinkToPage({ organizationId, clusterId, instanceId: instance.id }, 'sign-in');
	const operationsUrl = useMemo(() => getOperationsUrlForInstance(instance), [instance]);
	const instanceClient = useInstanceClient({ operationsUrl });
	const { update } = useOrganizationClusterInstancePermissions();
	const isFabricConnect = authStore.checkForFabricConnect(instance.id);

	const onSignOutClick = useCallback(async () => {
		await signOutOfInstance({ instance, instanceClient });
	}, [instance, instanceClient]);

	// A stopped / mid-transition instance isn't reachable — you can't connect or sign in — so show a
	// neutral placeholder instead of the perpetual spinner (which is meant for instances coming up).
	if (isStoppedOrTransitioning(instance.status)) {
		return <span className="text-muted-foreground text-sm">—</span>;
	}

	if (
		instanceAuthIsLoading || !instance.status
		|| !['CLONE_READY', 'RUNNING', 'UPDATED', 'PENDING_UPGRADE'].includes(instance.status)
	) {
		return <LoaderCircleIcon className="animate-spin" color="gray" />;
	}

	if (!instanceUser || isFabricConnect) {
		return (
			<span className="flex gap-4">
				{update && !isSelfManaged && (
					<Link
						to={instanceHref}
						className="text-sm"
						aria-label={`Connect to ${instance.name} instance`}
						title={`Connect to ${instance.name} instance`}
					>
						<Button variant="positiveOutline">Fabric Connect</Button>
					</Link>
				)}
				<Link
					to={signInHref}
					className="text-sm"
					aria-label={`Sign in to ${instance.name} instance`}
					title={`Sign in to ${instance.name} instance`}
				>
					<Button variant={update ? 'defaultOutline' : 'positiveOutline'}>Direct Sign In</Button>
				</Link>
			</span>
		);
	}

	return (
		<span className="flex gap-4">
			<Link
				to={instanceHref}
				className="text-sm"
				aria-label={`Go to ${instance.name} instance`}
				title={`Go to ${instance.name} instance`}
			>
				<Button variant="positiveOutline">Direct Connect</Button>
			</Link>
			<Button
				variant="destructiveOutline"
				className="text-sm"
				aria-label={`Sign out from ${instance.name} instance`}
				title={`Sign out from ${instance.name} instance`}
				onClick={onSignOutClick}
			>
				Direct Sign Out
			</Button>
		</span>
	);
}
