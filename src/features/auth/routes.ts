import { createRoute, redirect } from '@tanstack/react-router';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { SignIn } from '@/features/auth/SignIn';
import { SignUp } from '@/features/auth/SignUp';
import { ForgotPassword } from '@/features/auth/ForgotPassword';
import { VerifyEmail } from '@/features/auth/VerifyEmail';
import { RestPassword as ResetPassword } from '@/features/auth/ResetPassword';
import { rootRoute } from '@/router/rootRoute';
import { LocalSignIn } from '@/features/auth/LocalSignIn';

const authLayout = createRoute({
	getParentRoute: () => rootRoute,
	id: '_authLayout',
	component: AuthLayout,
});

const signInRoute = createRoute({
	getParentRoute: () => authLayout,
	path: '/',
	component: SignIn,
	beforeLoad: ({ context, location }) => {
		if (context.authentication.user) {
			const search: Record<string, string> = location?.search;
			throw redirect({ to: search?.redirect?.startsWith('/') ? search.redirect : '/orgs' });
		}
	},
});

const localSignInRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/',
	component: LocalSignIn,
	beforeLoad: ({ context, location }) => {
		if (context.authentication.user) {
			const search: Record<string, string> = location?.search;
			throw redirect({ to: search?.redirect?.startsWith('/') ? search.redirect : '/browse' });
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
	path: 'verifyemail',
	component: VerifyEmail,
});

const resetPasswordRoute = createRoute({
	getParentRoute: () => authLayout,
	path: 'resetpassword',
	component: ResetPassword,
});

export const authRouteTree =
	authLayout.addChildren([signInRoute, signUpRoute, forgotPasswordRoute, verifyEmailRoute, resetPasswordRoute]);

export const localAuthRouteTree = [
	localSignInRoute,
];
