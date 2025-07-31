import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { useAuth } from '@/hooks/useAuth';
import { Instance } from '@/lib/api.patch';
import { Link } from '@tanstack/react-router';

export function InstanceLogInCell({ instance }: { readonly instance: Instance }) {
	const { user: instanceUser, isLoading: instanceAuthIsLoading } = useAuth(instance);
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
			preload={false}
		>
			<span className="py-2 hover:border-b-2">Sign In</span>
		</Link>;
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
