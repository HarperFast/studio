import { isAxiosError } from 'axios';

/**
 * Detects the sign-up rejection that means "this email address is already taken".
 *
 * Creating a user is the only thing Studio POSTs to `/User/`, and every 409 that endpoint can
 * answer with means the address is unavailable, so the status alone identifies the case —
 * unlike the 403 in {@link isEmailNotVerifiedError}, which is shared with deactivated accounts
 * and therefore has to match the message too. central-manager reaches a 409 two ways:
 * `addUser` rejects an existing ACTIVE/CLOUD_MIGRATED account outright, and the `searchByValue`
 * lookup it starts with throws `Multiple <email> records found` when the address resolves to
 * more than one row — reachable today because account deletion is a soft `status: DELETED`
 * patch, so a deleted user signing up again leaves two rows on that email.
 *
 * The body is deliberately not inspected: it has varied across Harper versions (a bare string,
 * `error`/`message`, and now RFC 9457 `title`), and none of those phrasings — least of all the
 * multiple-records one — are worth showing a signing-up user.
 */
export function isEmailAlreadyRegisteredError(error: unknown): boolean {
	return isAxiosError(error) && error.response?.status === 409;
}
