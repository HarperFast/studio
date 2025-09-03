import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import { defaultInstanceRoute } from '@/config/constants';
import { useInstanceClient } from '@/config/useInstanceClient';
import { onInstanceLogoutSubmit } from '@/features/instance/operations/mutations/onInstanceLogoutSubmit';
import { useInstanceAuth } from '@/hooks/useAuth';
import { Instance } from '@/lib/api.patch';
import { authStore } from '@/lib/authStore';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { Link } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';

export function InstanceLogInCell({ instance }: { readonly instance: Instance }) {
	const { user: instanceUser, isLoading: instanceAuthIsLoading } = useInstanceAuth(instance.id);
	const operationsUrl = useMemo(() => getOperationsUrlForInstance(instance), [instance]);
	const instanceClient = useInstanceClient(operationsUrl);
	const onSignOutClick = useCallback(async () => {
		await onInstanceLogoutSubmit({ instanceClient });
		authStore.setUserForEntity(instance, null);
	}, [instance, instanceClient]);

	if (!['CLONE_READY', 'RUNNING', 'UPDATED'].includes(instance.status)) {
		return <p>N/A</p>;
	}
	if (instanceAuthIsLoading) {
		return <TextLoadingSkeleton />;
	}
	if (!instanceUser) {
		return <Link
			to={`instance/${instance.id}/sign-in`}
			className="text-sm"
			aria-label={`Sign in to ${instance.name} instance`}
			title={`Sign in to ${instance.name} instance`}
		>
			<Button variant="positiveOutline">Sign In</Button>
		</Link>;
	}
	return <span className="flex gap-4">
		<Link
			to={`instance/${instance.id}${defaultInstanceRoute}`}
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
