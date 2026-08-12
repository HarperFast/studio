import { isAxiosError } from 'axios';

/**
 * Detects the sign-up rejection that means "an account already uses this email address".
 *
 * central-manager's `User` resource answers a duplicate registration with HTTP 409 Conflict.
 * Creating a user is the only thing Studio POSTs to `/User/`, and a duplicate email is the
 * only conflict that endpoint can report, so the status alone identifies the case — unlike
 * the 403 in {@link isEmailNotVerifiedError}, which is shared with deactivated accounts and
 * therefore has to match the message too.
 *
 * The body is deliberately not inspected: it has varied across Harper versions (a bare
 * string, `error`/`message`, and now RFC 9457 `title`), and none of those phrasings are
 * worth showing a signing-up user.
 */
export function isEmailAlreadyRegisteredError(error: unknown): boolean {
	return isAxiosError(error) && error.response?.status === 409;
}
