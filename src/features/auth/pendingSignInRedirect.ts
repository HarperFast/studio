import { postSignInRedirectParam, redirectSearch } from '@/lib/urls/postSignInRedirect';
import { useLocation } from '@tanstack/react-router';

declare module '@tanstack/react-router' {
	interface HistoryState {
		/** Set on the way to `/sign-in` from a verify or reset link's page: that sign-in finishes an emailed flow. */
		finishesEmailedLink?: boolean;
	}
}

/**
 * A sign-in target kept across an emailed link, per address. The verify-email and reset-password links central-manager
 * sends carry only a token, and usually open in a new tab, so the target the sign-in page had is kept here for a while
 * and picked up by the completion that finishes that flow. Only a target `postSignInRedirect` accepts is kept, and it is
 * checked again when read.
 *
 * Only a completion that finishes an emailed flow follows a kept target: the verify page, and a sign-in reached from it
 * or from a reset (`finishesEmailedLink`). So a target someone typed an address into a form for, in this browser or
 * through a crafted link, fires only for the flow that form started, as a `?redirect=` on that page would.
 *
 * One key per address, so two tabs writing for different addresses never overwrite each other. A sign-out's storage
 * wipe removes them too.
 */
const KEY_PREFIX = 'Studio:PendingSignInRedirect:';

/** Long enough to read an email and follow its link; short enough that a later, unrelated sign-in rarely meets one. */
export const PENDING_SIGN_IN_REDIRECT_TTL_MS = 30 * 60 * 1000;

type KeptSignInRedirect = { redirect: string; expiresAt: number };

function keyFor(email: string): string | undefined {
	const address = email.trim().toLowerCase();
	return address ? KEY_PREFIX + address : undefined;
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
 * Before the user is sent off to an emailed link (a sign-up, a reset request, or a password sign-in that turns out
 * unverified): keeps the page's target for the address. A page without one keeps nothing.
 */
export function keepSignInRedirect(email: string, redirect: unknown, now = Date.now()): void {
	const key = keyFor(email);
	const param = postSignInRedirectParam(redirect);
	if (!key || param === undefined) {
		return;
	}
	try {
		pruneExpired(now);
		localStorage.setItem(key, JSON.stringify({ redirect: param, expiresAt: now + PENDING_SIGN_IN_REDIRECT_TTL_MS }));
	} catch (error) {
		// Private browsing or a full quota: the emailed link then lands on the default route, as before.
		console.debug('Could not keep the sign-in target for the emailed link:', error);
	}
}

function sameKept(raw: string | null, kept: KeptSignInRedirect): boolean {
	const current = parse(raw, Number.NEGATIVE_INFINITY);
	return current?.redirect === kept.redirect && current.expiresAt === kept.expiresAt;
}

/** Puts back what a storage wipe took while its flow still needs it, unless another flow has written one since. */
export function restoreSignInRedirect(email: string, kept: KeptSignInRedirect): void {
	const key = keyFor(email);
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

/** Removes one that has expired or can't be followed, since its key holds the address. */
export function readSignInRedirect(email: string, now = Date.now()): KeptSignInRedirect | undefined {
	const key = keyFor(email);
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

/** The address's kept target as `?redirect=`, for a page that sends the user on to sign in or reset. */
export function keptSignInRedirectSearch(email: string | undefined) {
	return email ? redirectSearch(readSignInRedirect(email)?.redirect) : undefined;
}

/** With `only`, forgets the address's target only while it is still that one: another flow may have written its own since. */
export function forgetSignInRedirect(email: string, only?: KeptSignInRedirect): void {
	const key = keyFor(email);
	if (!key) {
		return;
	}
	try {
		if (only === undefined || sameKept(localStorage.getItem(key), only)) {
			localStorage.removeItem(key);
		}
	} catch (error) {
		console.debug('Could not forget the kept sign-in target:', error);
	}
}

export function useFinishesEmailedLink(): boolean {
	return useLocation({ select: (location) => location.state.finishesEmailedLink === true });
}
