/**
 * Shared test data.
 *
 * EMAIL POLICY: never hard-code an address at a domain we don't control — the
 * backend may attempt real delivery (verification, resend, invite). The default
 * below uses the reserved `.test` TLD (RFC 6761), which is guaranteed to be
 * non-deliverable, so a render-only test can populate an `?email=` param without
 * any risk of dispatching mail to a stranger.
 *
 * Once a controlled test inbox exists, set PLAYWRIGHT_TEST_EMAIL in .env.e2e to a
 * real address on that inbox — flows that actually send/receive mail (the email
 * round-trip) will use it; render-only tests keep working with either value.
 */
// NOTE: `||`, not `??`. The documented config ships `PLAYWRIGHT_TEST_EMAIL=` (blank) so the mail
// round-trip auto-generates a per-run address; `??` keeps that empty string, which would navigate
// to `?email=` and silently exercise the no-email path instead of the unverified-email one.
export const UNVERIFIED_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL || 'unverified@studio.test';
