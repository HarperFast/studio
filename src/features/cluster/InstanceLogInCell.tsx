import { Button } from '@/components/ui/button';
import { defaultInstanceRoute } from '@/config/constants';
import { useInstanceClient } from '@/config/useInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useOrganizationClusterInstancePermissions } from '@/hooks/usePermissions';
import { Instance } from '@/integrations/api/api.patch';
import { onInstanceLogoutSubmit } from '@/integrations/api/instance/auth/onInstanceLogoutSubmit';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { Link } from '@tanstack/react-router';
import { LoaderCircleIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';

export function InstanceLogInCell(
	{ isSelfManaged, instance }: { readonly isSelfManaged: boolean; readonly instance: Instance },
) {
	const { user: instanceUser, isLoading: instanceAuthIsLoading } = useInstanceAuth(instance.id);
	const operationsUrl = useMemo(() => getOperationsUrlForInstance(instance), [instance]);
	const instanceClient = useInstanceClient(operationsUrl);
	const { update } = useOrganizationClusterInstancePermissions();
	const isFabricConnect = authStore.checkForFabricConnect(instance.id);

	const onSignOutClick = useCallback(async () => {
		await onInstanceLogoutSubmit({ instanceClient, entityId: instance.id });
		authStore.setUserForEntity(instance, null);
	}, [instance, instanceClient]);

	if (instanceAuthIsLoading || !['CLONE_READY', 'RUNNING', 'UPDATED'].includes(instance.status)) {
		return <LoaderCircleIcon className="animate-spin" color="gray" />;
	}

	if (!instanceUser || isFabricConnect) {
		return (
			<span className="flex gap-4">
				{update && !isSelfManaged && (
					<Link
						to={`../instance/${instance.id}${defaultInstanceRoute}`}
						className="text-sm"
						aria-label={`Connect to ${instance.name} instance`}
						title={`Connect to ${instance.name} instance`}
					>
						<Button variant="positiveOutline">Fabric Connect</Button>
					</Link>
				)}
				<Link
					to={`../instance/${instance.id}/sign-in`}
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
				to={`../instance/${instance.id}${defaultInstanceRoute}`}
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
