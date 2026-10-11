import Mailosaur from 'mailosaur';

/**
 * Thin wrapper around the controlled Mailosaur inbox.
 *
 * The untrusted lane must only ever receive the *extracted verification link* —
 * never a raw inbox read. Keep that boundary here: callers get an address and a
 * single link, nothing else. Swapping providers (MailSlurp, a self-hosted inbox)
 * is a change to this one file.
 */
const apiKey = process.env.MAILOSAUR_API_KEY;
const serverId = process.env.MAILOSAUR_SERVER_ID;

/** True when Mailosaur creds are present; specs skip themselves otherwise. */
export const mailConfigured = Boolean(apiKey && serverId);

let client: Mailosaur | undefined;
function getClient(): { client: Mailosaur; serverId: string } {
	if (!apiKey || !serverId) {
		throw new Error(
			'Mailosaur not configured — set MAILOSAUR_API_KEY and MAILOSAUR_SERVER_ID in e2e/.env.e2e',
		);
	}
	client ??= new Mailosaur(apiKey);
	return { client, serverId };
}

/**
 * A fresh, unique, controlled address on the Mailosaur server domain
 * (`<random>@<serverId>.mailosaur.net`). Unique-per-run avoids one run's leftover
 * mail being picked up by the next. Respects PLAYWRIGHT_TEST_EMAIL as an override.
 */
export function newTestEmailAddress(): string {
	if (process.env.PLAYWRIGHT_TEST_EMAIL) { return process.env.PLAYWRIGHT_TEST_EMAIL; }
	const { client, serverId } = getClient();
	return client.servers.generateEmailAddress(serverId);
}

export interface VerificationEmail {
	subject: string;
	/** The link whose href points at the verify-email/token endpoint. */
	link: string;
}

/**
 * Wait for the newest email sent to `address` and extract its verification link.
 * Throws (failing the test with a clear message) if none arrives in time or the
 * email carries no recognizable link.
 */
export async function waitForVerificationEmail(
	address: string,
	{ timeoutMs = 90_000, receivedAfter }: { timeoutMs?: number; receivedAfter?: Date } = {},
): Promise<VerificationEmail> {
	const { client, serverId } = getClient();
	const message = await client.messages.get(
		serverId,
		{ sentTo: address },
		{ timeout: timeoutMs, receivedAfter },
	);

	const hrefs = [...(message.html?.links ?? []), ...(message.text?.links ?? [])]
		.map((l) => l.href)
		.filter((href): href is string => Boolean(href));
	const link = hrefs.find((href) => /(verify-email|[?&]token=)/i.test(href));
	if (!link) {
		throw new Error(
			`No verification link found in email to ${address} (subject: "${message.subject}"). `
				+ `Links seen: ${hrefs.join(', ') || 'none'}`,
		);
	}
	return { subject: message.subject ?? '', link };
}

/**
 * Best-effort cleanup of the mail sent to `address`, so the server doesn't accumulate test mail.
 * Never the whole server: every lane and developer shares it, and a purge while another run is
 * inside `waitForVerificationEmail` deletes that run's verification email before it is read. A
 * pinned PLAYWRIGHT_TEST_EMAIL is skipped for the same reason — every run that pins it shares it.
 */
export async function deleteMailTo(address: string): Promise<void> {
	if (!mailConfigured || address === process.env.PLAYWRIGHT_TEST_EMAIL) { return; }
	try {
		const { client, serverId } = getClient();
		await deleteMessagesSentTo(client.messages, serverId, address);
	} catch (err) {
		console.warn(`[cleanup] could not delete mail sent to ${address} (non-fatal):`, err);
	}
}

export async function deleteMessagesSentTo(
	messages: Pick<Mailosaur['messages'], 'search' | 'del'>,
	serverId: string,
	address: string,
): Promise<number> {
	const { items = [] } = await messages.search(serverId, { sentTo: address }, { itemsPerPage: 1000 });
	for (const { id } of items) {
		await messages.del(id);
	}
	return items.length;
}
