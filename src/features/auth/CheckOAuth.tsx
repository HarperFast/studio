import { currentUserQueryKey, getCurrentUser } from '@/features/auth/queries/getCurrentUser';
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { loginSuccessDatadogAction } from '@/integrations/datadog/datadog';
import { reoClient } from '@/integrations/reo/reo';
import { parseCompanyFromEmail } from '@/lib/string/parseCompanyFromEmail';
import { getDefaultSignedInCloudRouteForUser } from '@/lib/urls/getDefaultSignedInCloudRouteForUser';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { toast } from 'sonner';

let checking: Promise<void> | null = null;

export function CheckOAuth() {
	const navigate = useNavigate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { redirect } = useSearch({ strict: false });

	useEffect(() => {
		if (checking) {
			return;
		}
		checking = (async function() {
			const user = await getCurrentUser().catch(() => null);
			if (!user) {
				toast.error('We were not able to verify your sign-in. Please try signing in again.', {
					duration: 10_000,
				});
				await navigate({ to: '/sign-in' });
			} else {
				authStore.setUserForEntity(OverallAppSignIn, user);
				const defaultCloudRoute = getDefaultSignedInCloudRouteForUser(user);

				loginSuccessDatadogAction(user);

				const company = parseCompanyFromEmail(user.email);
				reoClient?.identify?.({
					username: user.email,
					type: 'email',
					...(company ? { company } : {}),
				});
				await queryClient.invalidateQueries({ queryKey: currentUserQueryKey, refetchType: 'none' });
				await router.invalidate();
				await navigate({ to: redirect?.startsWith('/') ? redirect : defaultCloudRoute });
			}

			checking = null;
		})();
		// We only want this to fire once.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<div className="text-white w-lg flex flex-col gap-4">
			<h1 className="text-3xl font-light">
				<span
					aria-hidden="true"
					className="text-2xl animate-flower-dance mr-4"
					title="Loading"
				>🌼</span>
				Checking...
			</h1>

			<div className="underline flex gap-4">
				<Link className="text-sm opacity-50 hover:text-blue-300" to="/sign-in">
					Try signing in again
				</Link>
			</div>
		</div>
	);
}
