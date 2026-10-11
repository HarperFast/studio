import { addReactError } from '@datadog/browser-rum-react';
import type { ErrorInfo } from 'react';
import type { RootOptions } from 'react-dom/client';

const REPEAT_WINDOW_MS = 10_000;
const MAX_TRACKED_SIGNATURES = 100;

/** Signature → when it was last reported. Insertion order is report order, so expiry stops at the first live entry. */
const lastReportedAt = new Map<string, number>();

function text(value: unknown): string | null {
	if (typeof value === 'string' || typeof value === 'number') { return String(value); }
	return value == null ? null : typeof value;
}

/**
 * The endpoint fields keep two different requests that failed the same way from collapsing into one;
 * the signature never leaves memory.
 */
function signatureOf(error: unknown, componentStack: string | null | undefined): string {
	if (typeof error !== 'object' || error === null) {
		return JSON.stringify([typeof error, String(error), componentStack ?? null]);
	}
	const { name, message, stack, config } = error as {
		name?: unknown;
		message?: unknown;
		stack?: unknown;
		config?: { method?: unknown; baseURL?: unknown; url?: unknown } | null;
	};
	return JSON.stringify([
		typeof error,
		text(name),
		text(message),
		text(stack),
		componentStack ?? null,
		text(config?.method),
		text(config?.baseURL),
		text(config?.url),
	]);
}

function remember(signature: string, now: number) {
	for (const [key, at] of lastReportedAt) {
		if (now - at < REPEAT_WINDOW_MS) { break; }
		lastReportedAt.delete(key);
	}
	lastReportedAt.delete(signature);
	lastReportedAt.set(signature, now);
	if (lastReportedAt.size > MAX_TRACKED_SIGNATURES) {
		lastReportedAt.delete(lastReportedAt.keys().next().value!);
	}
}

/**
 * Report a failure React handed the root to RUM once, not once per time it is caught.
 *
 * TanStack Router re-throws a route's stored error whenever its match object changes, and every reload
 * of the route throws a fresh but identical one, so a single failed load reaches `onCaughtError` many
 * times. An identical failure within `REPEAT_WINDOW_MS` of its last report adds nothing.
 */
export function reportReactError(error: unknown, errorInfo: ErrorInfo): void {
	let signature: string | undefined;
	try {
		signature = signatureOf(error, errorInfo.componentStack);
	} catch {
		signature = undefined;
	}
	const now = performance.now();
	if (signature !== undefined) {
		const last = lastReportedAt.get(signature);
		if (last !== undefined && now - last < REPEAT_WINDOW_MS) { return; }
	}
	try {
		addReactError(error as Error, errorInfo);
	} catch {
		// The root callback must not throw on top of the failure it was handed; an unrecorded signature
		// lets the next catch try again.
		return;
	}
	if (signature !== undefined) { remember(signature, now); }
}

/**
 * The devtools copy goes to `console.warn`: the RUM SDK reports every `console.error` as an error of
 * its own (AGENTS.md, "Dropping `errorHandler` from an `onError` also drops the RUM report").
 */
export const reactRootErrorHandlers = {
	onUncaughtError: (error, errorInfo) => {
		reportReactError(error, errorInfo);
		console.warn('Uncaught error:', error, errorInfo);
	},
	onCaughtError: (error, errorInfo) => {
		reportReactError(error, errorInfo);
		console.warn('Caught error:', error, errorInfo);
	},
	onRecoverableError: (error, errorInfo) => {
		reportReactError(error, errorInfo);
		console.warn('Recoverable error:', error, errorInfo);
	},
} satisfies RootOptions;
