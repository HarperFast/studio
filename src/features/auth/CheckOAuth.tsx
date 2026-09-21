import { currentUserQueryKey, getCurrentUser } from '@/features/auth/queries/getCurrentUser';
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { loginSuccessDatadogAction } from '@/integrations/datadog/datadog';
import { reoClient } from '@/integrations/reo/reo';
import { parseCompanyFromEmail } from '@/lib/string/parseCompanyFromEmail';
import { clearUtmParamsFromUrl } from '@/lib/urls/clearUtmParams';
import { getDefaultSignedInCloudRouteForUser } from '@/lib/urls/getDefaultSignedInCloudRouteForUser';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { LoaderCircle } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { AuthHeading } from './components/AuthHeading';

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
				clearUtmParamsFromUrl();
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
		<div role="status" aria-live="polite" className="auth-form flex flex-col gap-4">
			<AuthHeading icon={LoaderCircle} title="Checking..." subtitle="We’re confirming your sign-in." loading />

			<div className="auth-links">
				<Link
					className="text-sm"
					to="/sign-in"
				>
					Try signing in again
				</Link>
			</div>
		</div>
	);
}
