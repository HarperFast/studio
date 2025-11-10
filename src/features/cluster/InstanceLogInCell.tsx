import { Button } from '@/components/ui/button';
import { defaultInstanceRoute } from '@/config/constants';
import { useInstanceClient } from '@/config/useInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { onInstanceLogoutSubmit } from '@/features/instance/operations/mutations/onInstanceLogoutSubmit';
import { useInstanceAuth } from '@/hooks/useAuth';
import { Instance } from '@/lib/api.patch';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { Link } from '@tanstack/react-router';
import { LoaderCircleIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';

export function InstanceLogInCell({ instance }: { readonly instance: Instance }) {
	const { user: instanceUser, isLoading: instanceAuthIsLoading } = useInstanceAuth(instance.id);
	const operationsUrl = useMemo(() => getOperationsUrlForInstance(instance), [instance]);
	const instanceClient = useInstanceClient(operationsUrl);
	const onSignOutClick = useCallback(async () => {
		await onInstanceLogoutSubmit({ instanceClient, entityId: instance.id });
		authStore.setUserForEntity(instance, null);
	}, [instance, instanceClient]);

	if (instanceAuthIsLoading || !['CLONE_READY', 'RUNNING', 'UPDATED'].includes(instance.status)) {
		return <LoaderCircleIcon className="animate-spin" color="gray" />;
	}
	if (!instanceUser) {
		return <Link
			to={`../instance/${instance.id}/sign-in`}
			className="text-sm"
			aria-label={`Sign in to ${instance.name} instance`}
			title={`Sign in to ${instance.name} instance`}
		>
			<Button variant="positiveOutline">Sign In</Button>
		</Link>;
	}
	return <span className="flex gap-4">
		<Link
			to={`../instance/${instance.id}${defaultInstanceRoute}`}
			className="text-sm"
			aria-label={`Go to ${instance.name} instance`}
			title={`Go to ${instance.name} instance`}
		>
			<Button variant="positiveOutline">View</Button>
		</Link>
		<Button
			variant="destructiveOutline"
			className="text-sm"
			aria-label={`Sign out from ${instance.name} instance`}
			title={`Sign out from ${instance.name} instance`}
			onClick={onSignOutClick}
		>
			Sign Out
		</Button>
	</span>;
}
