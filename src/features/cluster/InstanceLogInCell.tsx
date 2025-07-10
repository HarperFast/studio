import { useAuth } from '@/hooks/useAuth';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { InstanceLogInModal } from '@/features/cluster/modals/InstanceLoginModal';
import { Link } from '@tanstack/react-router';
import { Instance } from '@/lib/api.patch';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';

export function InstanceLogInCell({ instance }: { readonly instance: Instance }) {
	const { user: instanceUser, isLoading: instanceAuthIsLoading } = useAuth(instance);
	if (!['CLONE_READY', 'RUNNING', 'UPDATED'].includes(instance.status)) {
		return <p>N/A</p>;
	}
	if (instanceAuthIsLoading) {
		return <TextLoadingSkeleton />;
	}
	if (!instanceUser) {
		return <InstanceLogInModal
			instanceName={instance.name}
			operationsUrl={getOperationsUrlForInstance(instance)}
		/>;
	}
	return <Link
		to={`instance/${instance.id}/browse`}
		className="text-sm"
		aria-label={`Go to ${instance.name} instance`}
		title={`Go to ${instance.name} instance`}
		preload={false}
	>
		{/*TODO: We can't preload this route until we sort out how to improve the baseURL*/}
		<span className="py-2 hover:border-b-2">View</span>
	</Link>;
}
