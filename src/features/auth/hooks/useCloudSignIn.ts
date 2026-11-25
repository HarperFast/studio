import { apiClient } from '@/config/apiClient';
import { describeAuthFailure } from '@/features/auth/describeAuthFailure';
import { failFastOffline, reportAuthFailure } from '@/features/auth/failFastOffline';
import { clearPreviousAccount } from '@/features/auth/handlers/clearAuthStateLocally';
import { isEmailNotVerifiedError } from '@/features/auth/isEmailNotVerifiedError';
import {
	forgetSignInRedirect,
	keepSignInRedirect,
	readSignInRedirect,
	restoreSignInRedirect,
	useEmailedFlow,
} from '@/features/auth/pendingSignInRedirect';
import { currentUserQueryKey, fetchCurrentUser } from '@/features/auth/queries/getCurrentUser';
import { redirectAccess } from '@/features/auth/redirectAccess';
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { User } from '@/integrations/api/api.patch';
import { EmailSignInSchema } from '@/integrations/api/instance/auth/signInSchema';
import { loginSuccessDatadogAction } from '@/integrations/datadog/datadog';
import { reoClient } from '@/integrations/reo/reo';
import { parseCompanyFromEmail } from '@/lib/string/parseCompanyFromEmail';
import { clearUtmParamsFromUrl } from '@/lib/urls/clearUtmParams';
import { getDefaultSignedInCloudRouteForUser } from '@/lib/urls/getDefaultSignedInCloudRouteForUser';
import {
	followServerRedirect,
	postSignInRedirect,
	postSignInRedirectParam,
	redirectSearch,
} from '@/lib/urls/postSignInRedirect';
import type { PostSignInRedirect } from '@/lib/urls/postSignInRedirect';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { useResendEmailVerification } from './useResendEmailVerification';

/**
 * Resolves false when a sign-out or another sign-in landed before it could navigate. `redirect` defaults to the page's
 * search; a page whose search the router cannot read cleanly passes its own. `flow` is the emailed flow this completion
 * finishes (`pendingSignInRedirect.ts`): it continues to the target that flow kept when the page has none. A page that
 * can move on while this runs passes `stillCurrent`, and the completion gives up before taking the user in or
 * navigating once it is false.
 */
export function useCompleteCloudSignIn(options: { redirect?: unknown; flow?: string } = {}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const router = useRouter();
	const search = useSearch({ strict: false });
	const redirect = 'redirect' in options ? options.redirect : search.redirect;
	const { flow } = options;

	return useCallback(async (
		user: User,
		{ stillCurrent = () => true }: { stillCurrent?: () => boolean } = {},
	): Promise<boolean> => {
		// Read first: clearing a previous account below wipes localStorage, the kept target with it.
		const kept = readSignInRedirect(flow);
		// The verify page lets a signed-in visitor in, and the new session has already replaced theirs.
		const held = authStore.getHeldAppUser();
		const replacesAccount = held !== null && held !== user.id;
		let finished = false;
		let taken: { signOutGeneration: number; signInRevision: number } | undefined;
		const stillTaken = () =>
			taken !== undefined
			&& authStore.getSignOutGeneration(OverallAppSignIn) === taken.signOutGeneration
			&& authStore.getSignInRevision(OverallAppSignIn) === taken.signInRevision;
		try {
			return await completeSignIn();
		} finally {
			// The previous account's wipe took it, and its flow still needs it. Not once a sign-out or another sign-in has
			// landed: a sign-out's own wipe must take it too.
			if (flow !== undefined && kept !== undefined && replacesAccount && !finished && stillTaken()) {
				restoreSignInRedirect(flow, kept);
			}
		}

		async function completeSignIn(): Promise<boolean> {
			if (replacesAccount && !(await clearPreviousAccount())) {
				return false;
			}
			if (!stillCurrent()) {
				// Taken here so the restore above still puts back what the previous account's wipe took.
				taken = {
					signOutGeneration: authStore.getSignOutGeneration(OverallAppSignIn),
					signInRevision: authStore.getSignInRevision(OverallAppSignIn),
				};
				return false;
			}
			try {
				authStore.setUserForEntity(OverallAppSignIn, user);
			} finally {
				// After taking the user in moves the sign-in revision, even when that throws partway, so the restore above
				// still puts back what the previous account's wipe took.
				taken = {
					signOutGeneration: authStore.getSignOutGeneration(OverallAppSignIn),
					signInRevision: authStore.getSignInRevision(OverallAppSignIn),
				};
			}
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
			await queryClient.invalidateQueries({ queryKey: currentUserQueryKey, refetchType: 'none' });
			const target = await firstOpenTarget(user, [postSignInRedirect(redirect), postSignInRedirect(kept?.redirect)]);
			if (!stillTaken() || !stillCurrent()) {
				return false;
			}
			if (target?.kind === 'server') {
				followServerRedirect(target.href);
			} else {
				void router.invalidate();
				// `href`, not `to`: a target keeps its own query, which `to` would normalize as part of the path.
				await navigate(target ? { href: target.to } : { to: defaultCloudRoute });
			}
			if (flow !== undefined && stillTaken()) {
				finished = true;
				forgetSignInRedirect(flow);
			}
			return true;
		}
	}, [flow, navigate, queryClient, redirect, router]);
}

export function useCloudSignIn() {
	const navigate = useNavigate();
	const { redirect } = useSearch({ strict: false });
	const emailedFlow = useEmailedFlow();
	const completeSignIn = useCompleteCloudSignIn({ flow: emailedFlow });
	const [submitError, setSubmitError] = useState<string>();

	const { mutate: submitLoginData, isPending } = useLoginMutation();
	const { mutateAsync: resendEmailVerification } = useResendEmailVerification();

	const clearSubmitError = useCallback(() => setSubmitError(undefined), []);

	const submitForm = useCallback((formData: z.infer<typeof EmailSignInSchema>) => {
		setSubmitError(undefined);
		submitLoginData(formData, {
			onSuccess: (user) => completeSignIn(user),
			// The login mutation opts out of the global error toast (meta.skipGlobalErrorToast) so we
			// can special-case the unverified-email rejection instead of dead-ending on a red toast.
			onError: (error) => {
				if (isEmailNotVerifiedError(error)) {
					// This rejection only happens after central-manager accepts the password, so the
					// credentials are valid — resending a fresh link here can't be abused for spam. Only
					// claim "we sent a link" once the resend actually succeeds; navigate regardless so an
					// unverified user always lands on /verifying (which offers a manual resend) rather than
					// dead-ending on the sign-in page.
					const target = postSignInRedirectParam(redirect) ?? readSignInRedirect(emailedFlow)?.redirect;
					const flow = keepSignInRedirect(target);
					// A promise, not `mutate`'s callbacks, which the navigation below skips by unmounting this page. Its
					// failure is reported by the mutation itself.
					void resendEmailVerification({ email: formData.email, ...(flow ? { flow } : {}) }).then(() => {
						toast.info('Verify your email to finish signing in', {
							description: `We sent a new verification link to ${formData.email}.`,
						});
					}, () => {});
					void navigate({
						to: '/verifying',
						search: redirectSearch(target),
						state: { prefillEmail: formData.email },
					});
					return;
				}
				setSubmitError(describeAuthFailure(error, 'Try signing in again.'));
			},
		});
	}, [completeSignIn, emailedFlow, navigate, redirect, resendEmailVerification, submitLoginData]);

	return {
		clearSubmitError,
		isPending,
		submitError,
		submitForm,
	};
}

/**
 * The first target this account can open (`redirectAccess.ts`). Asks `/User/current` only when a target needs staff
 * access to decide and the `/Login/` record can't say; when that fails, the target is followed as it always was.
 */
async function firstOpenTarget(
	user: User,
	targets: Array<PostSignInRedirect | undefined>,
): Promise<PostSignInRedirect | undefined> {
	let current: User | null | undefined;
	for (const target of targets) {
		if (target === undefined) {
			continue;
		}
		let access = redirectAccess(user, target);
		if (access === 'unknown') {
			if (current === undefined) {
				current = await fetchCurrentUser().catch((error: unknown) => {
					console.debug('Could not read the signed-in account to check its sign-in target:', error);
					return null;
				});
			}
			access = current ? redirectAccess(current, target) : 'open';
		}
		if (access !== 'closed') {
			return target;
		}
		console.debug('Not following a sign-in target into an organization this account cannot open.');
	}
	return undefined;
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
