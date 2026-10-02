// `@harperfast/oauth` redirects a failed sign-in back to the app with `error`/`reason`
// query params (see its handlers.ts and docs/configuration.md) naming why. This maps
// those documented values to a specific, actionable message for `CheckOAuth`. Every
// entry is one of our own fixed strings — `error`/`reason` come straight off the URL
// (an IdP's own value, under `error=oauth_failed`, is arbitrary), so neither is ever
// interpolated into a message or otherwise reaches the DOM.

export const OAUTH_GENERIC_ERROR_MESSAGE = 'We were not able to verify your sign-in. Please try signing in again.';

const TRY_AGAIN_LATER_MESSAGE = 'Sign-in is temporarily unavailable. Please try again in a few minutes.';
const METHOD_NOT_ALLOWED_MESSAGE = "This sign-in method isn't allowed for your account.";

// Keyed by `reason`, the more specific of the two params. Covers both the generic
// handlers.ts reasons (csrf, token_exchange, ...) and the Fabric control plane's
// onLogin-hook reasons (email_not_verified, provider_not_authorized, ...).
const REASON_MESSAGES: Readonly<Record<string, string>> = {
	// Login-side or callback-side state/storage failures (handlers.ts) — nothing the
	// user did wrong, and sign-in couldn't have proceeded regardless.
	state_storage: TRY_AGAIN_LATER_MESSAGE,
	account_lookup_failed: TRY_AGAIN_LATER_MESSAGE,
	identity_resolution: TRY_AGAIN_LATER_MESSAGE,
	token_exchange: TRY_AGAIN_LATER_MESSAGE,
	user_mapping: TRY_AGAIN_LATER_MESSAGE,
	user_info: TRY_AGAIN_LATER_MESSAGE,
	login_hook: TRY_AGAIN_LATER_MESSAGE,
	internal_error: TRY_AGAIN_LATER_MESSAGE,
	unknown: TRY_AGAIN_LATER_MESSAGE,
	// State/browser-binding mismatch: the flow took too long, or started in another
	// browser. Retrying from scratch is the actual fix.
	csrf: 'Your sign-in session expired. Please try signing in again.',
	// The application's onLogin hook denied the login.
	email_not_verified: 'Verify your email address before signing in with this provider.',
	provider_not_authorized: METHOD_NOT_ALLOWED_MESSAGE,
	login_not_allowed: METHOD_NOT_ALLOWED_MESSAGE,
	denied: METHOD_NOT_ALLOWED_MESSAGE,
	login_denied: METHOD_NOT_ALLOWED_MESSAGE,
	confirmation_required: 'Your sign-in needs an extra step that was not completed. Please contact your administrator.',
	// The IdP itself reported `access_denied` (error=oauth_failed&reason=access_denied) — the
	// user declined or cancelled consent at the provider.
	access_denied: 'Sign-in was cancelled.',
};

// Keyed by the top-level `error`, used when `reason` is absent or not one of the
// values above (e.g. an IdP-specific error code under `error=oauth_failed`).
const ERROR_MESSAGES: Readonly<Record<string, string>> = {
	invalid_request: 'Your sign-in link is invalid or has expired. Please try signing in again.',
	server_error: TRY_AGAIN_LATER_MESSAGE,
	auth_failed: TRY_AGAIN_LATER_MESSAGE,
	oauth_failed: "The identity provider couldn't complete sign-in. Please try again.",
	access_denied: METHOD_NOT_ALLOWED_MESSAGE,
};

/**
 * Picks the user-facing message for a failed OAuth sign-in, or `undefined` when
 * `error` is absent (not a failed OAuth redirect at all). An `error` with no mapped
 * `reason` still gets a message — sign-in definitely failed — falling back to
 * `error`'s own message, then to a generic one for anything neither names.
 *
 * `Object.hasOwn` guards both lookups: `error`/`reason` are attacker-controlled URL
 * values, and a plain object literal inherits `Object.prototype` — `reason=constructor`
 * or `reason=toString` would otherwise resolve to that inherited function instead of
 * `undefined`.
 */
export function getOAuthErrorMessage(error: string | null, reason: string | null): string | undefined {
	if (!error) {
		return undefined;
	}
	if (reason && Object.hasOwn(REASON_MESSAGES, reason)) {
		return REASON_MESSAGES[reason];
	}
	return Object.hasOwn(ERROR_MESSAGES, error) ? ERROR_MESSAGES[error] : OAUTH_GENERIC_ERROR_MESSAGE;
}
