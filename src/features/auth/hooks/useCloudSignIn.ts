import { apiClient } from '@/config/apiClient';
import { describeAuthFailure } from '@/features/auth/describeAuthFailure';
import { failFastOffline, reportAuthFailure } from '@/features/auth/failFastOffline';
import { clearPreviousAccount } from '@/features/auth/handlers/clearAuthStateLocally';
import { isEmailNotVerifiedError } from '@/features/auth/isEmailNotVerifiedError';
import { currentUserQueryKey } from '@/features/auth/queries/getCurrentUser';
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { User } from '@/integrations/api/api.patch';
import { EmailSignInSchema } from '@/integrations/api/instance/auth/signInSchema';
import { loginSuccessDatadogAction } from '@/integrations/datadog/datadog';
import { reoClient } from '@/integrations/reo/reo';
import { parseCompanyFromEmail } from '@/lib/string/parseCompanyFromEmail';
import { clearUtmParamsFromUrl } from '@/lib/urls/clearUtmParams';
import { getDefaultSignedInCloudRouteForUser } from '@/lib/urls/getDefaultSignedInCloudRouteForUser';
import { followServerRedirect, postSignInRedirect, redirectSearch } from '@/lib/urls/postSignInRedirect';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { useResendEmailVerification } from './useResendEmailVerification';

/**
 * Resolves false when a sign-out or another sign-in landed before it could navigate. `redirect` defaults to the page's search; a page whose
 * search the router cannot read cleanly passes its own.
 */
export function useCompleteCloudSignIn(options?: { redirect: unknown }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const router = useRouter();
	const search = useSearch({ strict: false });
	const redirect = options ? options.redirect : search.redirect;

	return useCallback(async (user: User): Promise<boolean> => {
		// The verify page lets a signed-in visitor in, and the new session has already replaced theirs.
		const held = authStore.getHeldAppUser();
		if (held !== null && held !== user.id && !(await clearPreviousAccount())) {
			return false;
		}
		authStore.setUserForEntity(OverallAppSignIn, user);
		const defaultCloudRoute = getDefaultSignedInCloudRouteForUser(user);
		// A throttled `replaceState` or a broken analytics script must not strand a signed-in user on this page.
		try {
			clearUtmParamsFromUrl();
			loginSuccessDatadogAction(user);
			const company = parseCompanyFromEmail(user.email);
			reoClient?.identify?.({
				username: user.email,
				type: 'email',
				...(company ? { company } : {}),
			});
		} catch (error) {
			console.debug('Sign-in bookkeeping failed, carrying on:', error);
		}
		const signOutGeneration = authStore.getSignOutGeneration(OverallAppSignIn);
		const signInRevision = authStore.getSignInRevision(OverallAppSignIn);
		await queryClient.invalidateQueries({ queryKey: currentUserQueryKey, refetchType: 'none' });
		if (
			authStore.getSignOutGeneration(OverallAppSignIn) !== signOutGeneration
			|| authStore.getSignInRevision(OverallAppSignIn) !== signInRevision
		) {
			return false;
		}
		const target = postSignInRedirect(redirect);
		if (target?.kind === 'server') {
			followServerRedirect(target.href);
			return true;
		}
		void router.invalidate();
		// `href`, not `to`: a target keeps its own query, which `to` would normalize as part of the path.
		await navigate(target ? { href: target.to } : { to: defaultCloudRoute });
		return true;
	}, [navigate, queryClient, redirect, router]);
}

export function useCloudSignIn() {
	const navigate = useNavigate();
	const { redirect } = useSearch({ strict: false });
	const completeSignIn = useCompleteCloudSignIn();
	const [submitError, setSubmitError] = useState<string>();

	const { mutate: submitLoginData, isPending } = useLoginMutation();
	const { mutate: resendEmailVerification } = useResendEmailVerification();

	const clearSubmitError = useCallback(() => setSubmitError(undefined), []);

	const submitForm = useCallback((formData: z.infer<typeof EmailSignInSchema>) => {
		setSubmitError(undefined);
		submitLoginData(formData, {
			onSuccess: completeSignIn,
			// The login mutation opts out of the global error toast (meta.skipGlobalErrorToast) so we
			// can special-case the unverified-email rejection instead of dead-ending on a red toast.
			onError: (error) => {
				if (isEmailNotVerifiedError(error)) {
					// This rejection only happens after central-manager accepts the password, so the
					// credentials are valid — resending a fresh link here can't be abused for spam. Only
					// claim "we sent a link" once the resend actually succeeds; navigate regardless so an
					// unverified user always lands on /verifying (which offers a manual resend) rather than
					// dead-ending on the sign-in page.
					resendEmailVerification({ email: formData.email }, {
						onSuccess: () =>
							toast.info('Verify your email to finish signing in', {
								description: `We sent a new verification link to ${formData.email}.`,
							}),
					});
					void navigate({
						to: '/verifying',
						search: redirectSearch(redirect),
						state: { prefillEmail: formData.email },
					});
					return;
				}
				setSubmitError(describeAuthFailure(error, 'Try signing in again.'));
			},
		});
	}, [completeSignIn, navigate, redirect, resendEmailVerification, submitLoginData]);

	return {
		clearSubmitError,
		isPending,
		submitError,
		submitForm,
	};
}

export function useLoginMutation() {
	return useMutation<User, Error, z.infer<typeof EmailSignInSchema>>({
		...failFastOffline(onLoginSubmit),
		// submitForm renders the login-error UX itself (redirecting unverified users into the
		// email-verification flow), so suppress the default global error toast for this mutation.
		meta: { skipGlobalErrorToast: true },
		// At mutation level, not in the caller's `mutate` callback: React Query skips those when
		// the component unmounts mid-flight, and this is the only thing reporting the rejection
		// now that `skipGlobalErrorToast` keeps `errorHandler` out of the path. The unverified-email
		// rejection is excluded because it is control flow, not a failure — `submitForm` redirects
		// into the verification flow on it, and reporting it would file every unverified sign-in.
		onError: (error) => {
			if (!isEmailNotVerifiedError(error)) {
				reportAuthFailure(error);
			}
		},
	});
}

async function onLoginSubmit({ email, password }: z.infer<typeof EmailSignInSchema>) {
	// TODO: The OpenAPI request body for this endpoint isn't defined.
	const { data } = await apiClient.post('/Login/', {
		email,
		password,
	});
	if (data) {
		// TODO: The OpenAPI response for this endpoint isn't defined.
		return data as unknown as User;
	} else {
		throw new Error('Something went wrong');
	}
}
