import { currentUserQueryKey, getCurrentUser } from '@/features/auth/queries/getCurrentUser';
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { loginSuccessDatadogAction } from '@/integrations/datadog/datadog';
import { reoClient } from '@/integrations/reo/reo';
import { parseCompanyFromEmail } from '@/lib/string/parseCompanyFromEmail';
import { clearOAuthErrorParamsFromUrl } from '@/lib/urls/clearOAuthErrorParams';
import { clearUtmParamsFromUrl } from '@/lib/urls/clearUtmParams';
import { getDefaultSignedInCloudRouteForUser } from '@/lib/urls/getDefaultSignedInCloudRouteForUser';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { LoaderCircle } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { AuthHeading } from './components/AuthHeading';
import { getOAuthErrorMessage, OAUTH_GENERIC_ERROR_MESSAGE } from './getOAuthErrorMessage';

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
		// Promise.resolve().then(...), not a plain async IIFE: guarantees `checking` is
		// assigned before the body runs, so a synchronous throw inside can't run `finally`
		// on a not-yet-assigned lock.
		checking = Promise.resolve().then(async () => {
			try {
				// Hash router: `useSearch` only sees the hash's own query string, so the
				// plugin's pre-hash error/reason params need `window.location.search` directly.
				const params = new URLSearchParams(window.location.search);
				const oauthErrorMessage = getOAuthErrorMessage(params.get('error'), params.get('reason'));
				// Isolated: a throw here (e.g. a throttled history.replaceState) must not
				// skip the toast/navigate below, which is the one thing a failed sign-in
				// redirect needs to show.
				try {
					clearOAuthErrorParamsFromUrl();
				} catch (error) {
					console.debug('Failed to clear OAuth error params from the URL, carrying on:', error);
				}

				if (oauthErrorMessage) {
					toast.error(oauthErrorMessage, { duration: 10_000 });
					await navigate({ to: '/sign-in' });
					return;
				}

				const user = await getCurrentUser().catch(() => null);
				if (!user) {
					toast.error(OAUTH_GENERIC_ERROR_MESSAGE, {
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
			} finally {
				checking = null;
			}
		}).catch((error) => {
			// console.debug, not console.error: the RUM SDK promotes console.error to an
			// Error Tracking event (authStore.ts's reportLogoutFailure, #1658, same reason).
			console.debug('OAuth sign-in check failed, carrying on:', error);
		});
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
