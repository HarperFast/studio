import { MAX_WORKER_MODEL_CHARS } from '@/lib/monaco/workerLimits';

/**
 * The record editors highlight JSON with a worker-free language (see
 * `workerFreeJsonLanguage.ts`), so there are no inline validation markers to
 * gate the Save button on. These helpers replace that signal:
 *
 * - {@link isRecordJsonProbablyValid} is a cheap, main-thread check for the Save
 *   button, run on every change but only *parsing* content small enough to be
 *   safe to parse repeatedly.
 * - {@link tryParseRecordJson} is the authoritative, caught parse the submit
 *   handlers run once, so an oversized/never-live-checked buffer that turns out
 *   to be malformed surfaces a toast instead of throwing an uncaught
 *   `SyntaxError`.
 */

export type ParsedRecordJson = { ok: true; value: unknown } | { ok: false };

/**
 * Whether `content` is worth enabling Save for. Empty content is nothing to
 * save. Content over {@link MAX_WORKER_MODEL_CHARS} is not parsed here — parsing
 * a multi-hundred-KB buffer on every keystroke is the cost we are avoiding — so
 * it is treated as valid and left to {@link tryParseRecordJson} at submit time.
 * Everything else is validated with a real parse.
 */
export function isRecordJsonProbablyValid(content: string | undefined | null): boolean {
	if (!content) {
		return false;
	}
	if (content.length > MAX_WORKER_MODEL_CHARS) {
		return true;
	}
	return tryParseRecordJson(content).ok;
}

/** Parse `content` as JSON, returning a result object rather than throwing. */
export function tryParseRecordJson(content: string): ParsedRecordJson {
	try {
		return { ok: true, value: JSON.parse(content) };
	} catch {
		return { ok: false };
	}
}
