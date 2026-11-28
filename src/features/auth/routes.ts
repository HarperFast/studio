import { defaultInstanceRoute } from '@/config/constants';
import { syncCurrentUser } from '@/features/auth/queries/getCurrentUser';
import { ACCESS_LOOKUP_TIMEOUT_MS, redirectAccess } from '@/features/auth/redirectAccess';
import { type AuthenticatedConnection, authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { errorStatus } from '@/lib/errorStatus';
import { getDefaultSignedInCloudRouteForUser } from '@/lib/urls/getDefaultSignedInCloudRouteForUser';
import { appRedirectTarget, postSignInRedirect } from '@/lib/urls/postSignInRedirect';
import type { PostSignInRedirect } from '@/lib/urls/postSignInRedirect';
import { guardedAppSignIn } from '@/router/guardedAppSignIn';
import { rootRoute } from '@/router/rootRoute';
import { createRoute, redirect } from '@tanstack/react-router';
import { AuthLayout } from './AuthLayout';
import { CheckOAuth } from './CheckOAuth';
import { ClusterInstanceSignIn } from './ClusterInstanceSignIn';
import { ForgotPassword } from './ForgotPassword';
import { ResetPassword } from './ResetPassword';
import { SignIn } from './SignIn';
import { SignUp } from './SignUp';
import { VerifyEmail } from './VerifyEmail';
import { Verifying } from './Verifying';

const authLayout = createRoute({
	getParentRoute: () => rootRoute,
	id: '_authLayout',
	component: AuthLayout,
});

type SignedInUser = NonNullable<AuthenticatedConnection['user']>;

/**
 * Where a signed-in visitor's target leaves them, and the account it was decided for. The store can hold the `/Login/`
 * record, which can't decide (`redirectAccess.ts`). Then `/User/current` decides, as at sign-in, and is synced into
 * the store, so the next visit doesn't ask; when another account holds the session, that is the account decided for.
 * A failed or slow read follows the target, as sign-in does. `'no-session'` when the session is gone: the 401 handler
 * signs the tab out, and the page should not send it anywhere first.
 */
async function signedInTarget(
	user: SignedInUser,
	target: PostSignInRedirect,
): Promise<{ target: PostSignInRedirect | undefined; user: SignedInUser } | 'no-session'> {
	const access = redirectAccess(user, target);
	if (access !== 'unknown') {
		return { target: access === 'closed' ? undefined : target, user };
	}
	const signOutGeneration = authStore.getSignOutGeneration(OverallAppSignIn);
	const signInRevision = authStore.getSignInRevision(OverallAppSignIn);
	try {
		// An answer the store refused, because a sign-out or sign-in overtook it, sends the page nowhere: it re-runs for
		// what landed. Taking another tab's account in moves the counters too, so only the store's verdict settles it.
		const { user: current, applied } = await syncCurrentUser({ timeout: ACCESS_LOOKUP_TIMEOUT_MS });
		if (!applied) {
			return 'no-session';
		}
		return { target: redirectAccess(current, target) === 'closed' ? undefined : target, user: current };
	} catch (error) {
		const overtaken = authStore.getSignOutGeneration(OverallAppSignIn) !== signOutGeneration
			|| authStore.getSignInRevision(OverallAppSignIn) !== signInRevision;
		if (errorStatus(error) === 401 || overtaken) {
			return 'no-session';
		}
		console.debug('Could not read the signed-in account to check its redirect:', error);
		return { target, user };
	}
}

/**
 * Sends a signed-in visitor on to the target their `?redirect=` names. Without one, `/sign-in` sends them to their
 * default route and `/sign-up` shows its form, as it always has.
 */
async function continueSignedIn(
	user: SignedInUser,
	search: Record<string, unknown> | undefined,
	{ orDefaultRoute }: { orDefaultRoute: boolean },
): Promise<void> {
	const named = postSignInRedirect(search?.redirect);
	const decided = named ? await signedInTarget(user, named) : { target: undefined, user };
	if (decided === 'no-session') {
		return;
	}
	const { target } = decided;
	if (target?.kind === 'server') {
		// A full-page load. The router follows a thrown redirect by replacing this entry, so Back does not land on a
		// sign-in page that sends the user straight on again.
		throw redirect({ href: target.href, reloadDocument: true });
	}
	if (target) {
		throw redirect({ href: target.to });
	}
	if (orDefaultRoute) {
		// The account decided for: after a mismatch, the old account's default route is one the session can't open.
		throw redirect({ to: getDefaultSignedInCloudRouteForUser(decided.user) });
	}
}

const signInRoute = createRoute({
	getParentRoute: () => authLayout,
	path: 'sign-in',
	head: () => ({ meta: [{ title: 'Sign In — Harper Fabric' }] }),
	component: SignIn,
	beforeLoad: async ({ context, location }) => {
		const user = guardedAppSignIn(context)?.user;
		if (user) {
			await continueSignedIn(user, location?.search, { orDefaultRoute: true });
		}
	},
});

const localSignInRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: 'sign-in',
	head: () => ({ meta: [{ title: 'Sign In — Harper Fabric' }] }),
	component: ClusterInstanceSignIn,
	beforeLoad: ({ context, location }) => {
		if (guardedAppSignIn(context)?.user) {
			const search: Record<string, unknown> = location?.search;
			const target = appRedirectTarget(search?.redirect);
			if (target) {
				throw redirect({ href: target });
			}
			throw redirect({ to: defaultInstanceRoute });
		}
	},
});

const signUpRoute = createRoute({
	getParentRoute: () => authLayout,
	path: 'sign-up',
	head: () => ({ meta: [{ title: 'Sign Up — Harper Fabric' }] }),
	component: SignUp,
	beforeLoad: async ({ context, location }) => {
		const user = guardedAppSignIn(context)?.user;
		if (user) {
			await continueSignedIn(user, location?.search, { orDefaultRoute: false });
		}
	},
});
const forgotPasswordRoute = createRoute({
	getParentRoute: () => authLayout,
	path: 'forgot-password',
	head: () => ({ meta: [{ title: 'Forgot Password — Harper Fabric' }] }),
	component: ForgotPassword,
});

const verifyEmailRoute = createRoute({
	getParentRoute: () => authLayout,
	path: 'verify-email',
	head: () => ({ meta: [{ title: 'Verify Email — Harper Fabric' }] }),
	component: VerifyEmail,
});

const verifyingEmailRoute = createRoute({
	getParentRoute: () => authLayout,
	path: 'verifying',
	head: () => ({ meta: [{ title: 'Check Your Email — Harper Fabric' }] }),
	component: Verifying,
});

const checkOAuthRoute = createRoute({
	getParentRoute: () => authLayout,
	path: 'check-oauth',
	head: () => ({ meta: [{ title: 'Signing In — Harper Fabric' }] }),
	component: CheckOAuth,
});

const resetPasswordRoute = createRoute({
	getParentRoute: () => authLayout,
	path: 'reset-password',
	head: () => ({ meta: [{ title: 'Reset Password — Harper Fabric' }] }),
	component: ResetPassword,
});

export const authRouteTree = authLayout.addChildren([
	signInRoute,
	signUpRoute,
	checkOAuthRoute,
	forgotPasswordRoute,
	verifyEmailRoute,
	verifyingEmailRoute,
	resetPasswordRoute,
]);

export const localAuthRoutes = [
	localSignInRoute,
];
