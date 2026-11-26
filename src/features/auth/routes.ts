import { defaultInstanceRoute } from '@/config/constants';
import { fetchCurrentUser } from '@/features/auth/queries/getCurrentUser';
import { redirectAccess } from '@/features/auth/redirectAccess';
import type { AuthenticatedConnection } from '@/features/auth/store/authStore';
import { isLocalUser } from '@/lib/types/isLocalUser';
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
 * Whether a signed-in visitor can open `target`. The store can hold the `/Login/` record, which lacks the staff fields:
 * sign-in takes in `/User/current` only when it had to ask, so a sign-in with no target, or a member's, keeps the slim
 * one. Where that record can't say, `/User/current` decides, as at sign-in, and a failed read follows the target, as
 * sign-in does. An answer for another account, which now holds the session, opens nothing.
 */
async function signedInAccess(user: SignedInUser, target: PostSignInRedirect): Promise<'open' | 'closed'> {
	const access = redirectAccess(user, target);
	if (access !== 'unknown') {
		return access;
	}
	// `redirectAccess` opens every target to a local user, so only a central manager account gets here.
	if (isLocalUser(user)) {
		return 'open';
	}
	let current: Awaited<ReturnType<typeof fetchCurrentUser>>;
	try {
		current = await fetchCurrentUser();
	} catch (error) {
		console.debug('Could not read the signed-in account to check its redirect:', error);
		return 'open';
	}
	if (current.id !== user.id) {
		return 'closed';
	}
	return redirectAccess(current, target) === 'closed' ? 'closed' : 'open';
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
	const target = named && (await signedInAccess(user, named)) === 'open' ? named : undefined;
	if (target?.kind === 'server') {
		// A full-page load. The router follows a thrown redirect by replacing this entry, so Back does not land on a
		// sign-in page that sends the user straight on again.
		throw redirect({ href: target.href, reloadDocument: true });
	}
	if (target) {
		throw redirect({ href: target.to });
	}
	if (orDefaultRoute) {
		throw redirect({ to: getDefaultSignedInCloudRouteForUser(user) });
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
