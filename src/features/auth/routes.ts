import { defaultInstanceRoute } from '@/config/constants';
import { redirectAccess } from '@/features/auth/redirectAccess';
import type { AuthenticatedConnection } from '@/features/auth/store/authStore';
import { getDefaultSignedInCloudRouteForUser } from '@/lib/urls/getDefaultSignedInCloudRouteForUser';
import { appRedirectTarget, postSignInRedirect } from '@/lib/urls/postSignInRedirect';
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

/**
 * Sends a signed-in visitor on to the target their `?redirect=` names. Without one, `/sign-in` sends them to their
 * default route and `/sign-up` shows its form, as it always has.
 */
function continueSignedIn(
	user: NonNullable<AuthenticatedConnection['user']>,
	search: Record<string, unknown> | undefined,
	{ orDefaultRoute }: { orDefaultRoute: boolean },
): void {
	const named = postSignInRedirect(search?.redirect);
	// `'unknown'` follows, as sign-in does when it can't read `/User/current`: sign-in takes in that record whenever it
	// had to ask, so only a failed read leaves the store without the staff fields.
	const target = named && redirectAccess(user, named) !== 'closed' ? named : undefined;
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
	beforeLoad: ({ context, location }) => {
		const user = guardedAppSignIn(context)?.user;
		if (user) {
			continueSignedIn(user, location?.search, { orDefaultRoute: true });
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
	beforeLoad: ({ context, location }) => {
		const user = guardedAppSignIn(context)?.user;
		if (user) {
			continueSignedIn(user, location?.search, { orDefaultRoute: false });
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
