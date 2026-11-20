import { postSignInRedirectParam, redirectSearch } from '@/lib/urls/postSignInRedirect';
import { useLocation } from '@tanstack/react-router';

declare module '@tanstack/react-router' {
	interface HistoryState {
		/** The emailed flow a sign-in finishes, set on the way to `/sign-in` from a verify or reset link's page. */
		emailedFlow?: string;
	}
}

/**
 * A sign-in target kept across an emailed link. The verify-email and reset-password links central-manager sends usually
 * open in a new tab, so the page that asks for the email keeps its target here under a new flow id and names the id in
 * its request. central-manager carries it back on the link as `?flow=` (studio#2128). Only the page that link opens, and
 * a sign-in it sends the user on to, follow the target: another flow's link names another id, and a link someone else
 * asked for names an id this browser never kept.
 *
 * A sign-out's storage wipe removes them too.
 */
const KEY_PREFIX = 'Studio:PendingSignInRedirect:';

/** Long enough to read an email and follow its link. */
export const PENDING_SIGN_IN_REDIRECT_TTL_MS = 30 * 60 * 1000;

/** What central-manager accepts as `flow` and puts in the link as is (its `EMAILED_FLOW_REGEX`). */
const FLOW_ID = /^[A-Za-z0-9_-]{22,64}$/;

type KeptSignInRedirect = { redirect: string; expiresAt: number };

export function emailedFlowParam(value: unknown): string | undefined {
	return typeof value === 'string' && FLOW_ID.test(value) ? value : undefined;
}

// 128 random bits, base64url: 22 characters.
function newFlowId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function keyFor(flow: string | undefined): string | undefined {
	return emailedFlowParam(flow) === undefined ? undefined : KEY_PREFIX + flow;
}

function parse(raw: string | null, now: number): KeptSignInRedirect | undefined {
	if (!raw) {
		return undefined;
	}
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return undefined;
	}
	const kept = value as Partial<KeptSignInRedirect> | null;
	if (!kept || typeof kept.expiresAt !== 'number' || kept.expiresAt <= now) {
		return undefined;
	}
	const redirect = postSignInRedirectParam(kept.redirect);
	return redirect === undefined ? undefined : { redirect, expiresAt: kept.expiresAt };
}

function pruneExpired(now: number): void {
	const stale: string[] = [];
	for (let index = 0; index < localStorage.length; index++) {
		const key = localStorage.key(index);
		if (key?.startsWith(KEY_PREFIX) && !parse(localStorage.getItem(key), now)) {
			stale.push(key);
		}
	}
	for (const key of stale) {
		localStorage.removeItem(key);
	}
}

/**
 * Before a page sends the user off to an emailed link (a sign-up, a reset request or a new verification link): keeps its
 * target under a new flow id, for the request to name as `flow`. Without a target there is no flow. A refused request
 * leaves a record no link names, which expires.
 */
export function keepSignInRedirect(redirect: unknown, now = Date.now()): string | undefined {
	const param = postSignInRedirectParam(redirect);
	if (param === undefined) {
		return undefined;
	}
	try {
		const flow = newFlowId();
		pruneExpired(now);
		localStorage.setItem(
			KEY_PREFIX + flow,
			JSON.stringify({ redirect: param, expiresAt: now + PENDING_SIGN_IN_REDIRECT_TTL_MS }),
		);
		return flow;
	} catch (error) {
		// Private browsing or a full quota: the emailed link then lands on the default route.
		console.debug('Could not keep the sign-in target for the emailed link:', error);
		return undefined;
	}
}

export function restoreSignInRedirect(flow: string, kept: KeptSignInRedirect): void {
	const key = keyFor(flow);
	if (!key) {
		return;
	}
	try {
		if (localStorage.getItem(key) === null) {
			localStorage.setItem(key, JSON.stringify(kept));
		}
	} catch (error) {
		console.debug('Could not put back the kept sign-in target:', error);
	}
}

/** Removes one that has expired or can't be followed. */
export function readSignInRedirect(flow: string | undefined, now = Date.now()): KeptSignInRedirect | undefined {
	const key = keyFor(flow);
	if (!key) {
		return undefined;
	}
	try {
		const raw = localStorage.getItem(key);
		const kept = parse(raw, now);
		if (raw !== null && kept === undefined) {
			localStorage.removeItem(key);
		}
		return kept;
	} catch (error) {
		console.debug('Could not read the kept sign-in target:', error);
		return undefined;
	}
}

export function keptSignInRedirectSearch(flow: string | undefined) {
	return redirectSearch(readSignInRedirect(flow)?.redirect);
}

export function forgetSignInRedirect(flow: string): void {
	const key = keyFor(flow);
	if (!key) {
		return;
	}
	try {
		localStorage.removeItem(key);
	} catch (error) {
		console.debug('Could not forget the kept sign-in target:', error);
	}
}

export function useEmailedFlow(): string | undefined {
	return useLocation({ select: (location) => emailedFlowParam(location.state.emailedFlow) });
}
