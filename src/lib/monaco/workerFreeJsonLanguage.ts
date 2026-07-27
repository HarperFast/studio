import type * as Monaco from 'monaco-editor/editor';
import { createTokenizationSupport } from 'monaco-editor/languages/features/json/tokenization.js';

/**
 * Language id for a JSON editor that highlights but never spins up a language
 * worker.
 *
 * Monaco's built-in `json` language backs validation, folding, colors, and
 * completion with a web worker, and syncs the model's full text (and every
 * change delta) to it over `postMessage` — a structured clone. A large enough
 * record (a row with a big blob/array, or a bulk-insert array pasted into "Add
 * row") overflows the clone buffer and crashes the worker with "DataCloneError:
 * ... out of memory.", which Monaco reports as an unhandled error and then
 * retries, flooding the session (HarperFast/studio#1370 / #1499, recurring
 * through the browse record editors).
 *
 * Switching to `plaintext` once the content is already oversized cannot prevent
 * that: `@monaco-editor/react` applies a changed `language` prop in a later
 * effect, and once the model has been synced the worker's own change listener
 * posts the oversized delta before any language switch runs — so the guard the
 * Applications/log editors use (size-based `json`→`plaintext`) leaves the paste
 * path exposed for an *editable* editor. This language sidesteps the race
 * entirely: it registers only the main-thread JSON tokenizer plus the standard
 * JSON language configuration (brackets, auto-closing pairs), and no
 * worker-backed providers — so there is no language worker to overflow, at any
 * size. Records lose worker-only affordances (inline validation squiggles,
 * folding, format-on-type); highlighting and bracket handling are unchanged.
 */
export const WORKER_FREE_JSON_LANGUAGE_ID = 'json-worker-free';

/** Mirrors Monaco's built-in `json` rich-edit configuration (see monaco-json's
 * `jsonMode`) so editing feels identical to the worker-backed `json` language.
 * Records are strict JSON, but the comment settings are kept for parity — a
 * saved comment is rejected by the submit-time `JSON.parse`, not silently. */
const jsonLanguageConfiguration: Monaco.languages.LanguageConfiguration = {
	wordPattern: /(-?\d*\.\d\w*)|([^[{\]}:"\s,]+)/g,
	comments: {
		lineComment: '//',
		blockComment: ['/*', '*/'],
	},
	brackets: [
		['{', '}'],
		['[', ']'],
	],
	autoClosingPairs: [
		{ open: '{', close: '}', notIn: ['string'] },
		{ open: '[', close: ']', notIn: ['string'] },
		{ open: '"', close: '"', notIn: ['string'] },
	],
};

/** The pieces of the Monaco namespace this registration touches. Narrowed so the
 * registration is unit-testable without a real editor, and so a test can assert
 * that no worker-backed provider is ever registered for this language. */
export type WorkerFreeJsonMonaco = Pick<
	typeof Monaco.languages,
	'register' | 'setLanguageConfiguration' | 'setTokensProvider'
>;

let registered = false;

/**
 * Register {@link WORKER_FREE_JSON_LANGUAGE_ID}. Idempotent — safe across HMR and
 * repeated setup imports. Registers only tokenization + language configuration;
 * deliberately registers none of the worker-backed JSON providers.
 */
export function registerWorkerFreeJsonLanguage(monaco: WorkerFreeJsonMonaco): void {
	if (registered) {
		return;
	}
	registered = true;
	monaco.register({ id: WORKER_FREE_JSON_LANGUAGE_ID });
	monaco.setLanguageConfiguration(WORKER_FREE_JSON_LANGUAGE_ID, jsonLanguageConfiguration);
	// `true` = tokenize comments, matching monaco-json's own tokenizer setup.
	monaco.setTokensProvider(WORKER_FREE_JSON_LANGUAGE_ID, createTokenizationSupport(true));
}
