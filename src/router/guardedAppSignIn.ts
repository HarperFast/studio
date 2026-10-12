import {
	type AuthenticatedConnection,
	authStore,
	type EntityIds,
	OverallAppSignIn,
} from '@/features/auth/store/authStore';

const signedOut: AuthenticatedConnection = { isLoading: false, user: null };

/**
 * The app sign-in as every route guard reads it: the router context, except that a sign-out the store already
 * knows of wins. The context hears of one a tick after the store does. A guard reading the context alone lets
 * a load that starts in that tick fetch on the ended session; one reading the store alone bounces off a guard
 * that reads the context.
 */
export function guardedAppSignIn(
	context: { authentication: Record<EntityIds, AuthenticatedConnection> },
): AuthenticatedConnection | undefined {
	return authStore.isKnownSignedOut(OverallAppSignIn) ? signedOut : context.authentication[OverallAppSignIn];
}
