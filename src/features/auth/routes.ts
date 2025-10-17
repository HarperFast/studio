import { defaultInstanceRoute } from '@/config/constants';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { ClusterInstanceSignIn } from '@/features/auth/ClusterInstanceSignIn';
import { ForgotPassword } from '@/features/auth/ForgotPassword';
import { RestPassword as ResetPassword } from '@/features/auth/ResetPassword';
import { SignIn } from '@/features/auth/SignIn';
import { SignUp } from '@/features/auth/SignUp';
import { VerifyEmail } from '@/features/auth/VerifyEmail';
import { Verifying } from '@/features/auth/Verifying';
import { OverallAppSignIn } from '@/lib/authStore';
import { getDefaultSignedInCloudRouteForUser } from '@/lib/urls/getDefaultSignedInCloudRouteForUser';
import { rootRoute } from '@/router/rootRoute';
import { createRoute, redirect } from '@tanstack/react-router';

const authLayout = createRoute({
	getParentRoute: () => rootRoute,
	id: '_authLayout',
	component: AuthLayout,
});

const signInRoute = createRoute({
	getParentRoute: () => authLayout,
	path: 'sign-in',
	component: SignIn,
	beforeLoad: ({ context, location }) => {
		const user = context.authentication[OverallAppSignIn]?.user;
		if (user) {
			const search: Record<string, string> = location?.search;
			const defaultRoute = getDefaultSignedInCloudRouteForUser(user);
			throw redirect({ to: search?.redirect?.startsWith('/') ? search.redirect : defaultRoute });
		}
	},
});

const localSignInRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: 'sign-in',
	component: ClusterInstanceSignIn,
	beforeLoad: ({ context, location }) => {
		if (context.authentication[OverallAppSignIn]?.user) {
			const search: Record<string, string> = location?.search;
			throw redirect({ to: search?.redirect?.startsWith('/') ? search.redirect : defaultInstanceRoute });
		}
	},
});

const signUpRoute = createRoute({
	getParentRoute: () => authLayout,
	path: 'sign-up',
	component: SignUp,
});
const forgotPasswordRoute = createRoute({
	getParentRoute: () => authLayout,
	path: 'forgot-password',
	component: ForgotPassword,
});

const verifyEmailRoute = createRoute({
	getParentRoute: () => authLayout,
	path: 'verify-email',
	component: VerifyEmail,
});

const verifyingEmailRoute = createRoute({
	getParentRoute: () => authLayout,
	path: 'verifying',
	component: Verifying,
});

const resetPasswordRoute = createRoute({
	getParentRoute: () => authLayout,
	path: 'reset-password',
	component: ResetPassword,
});

export const authRouteTree =
	authLayout.addChildren([
		signInRoute,
		signUpRoute,
		forgotPasswordRoute,
		verifyEmailRoute,
		verifyingEmailRoute,
		resetPasswordRoute,
	]);

export const localAuthRoutes = [
	localSignInRoute,
];
