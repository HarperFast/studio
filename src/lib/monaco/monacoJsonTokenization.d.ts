/**
 * Monaco's built-in JSON tokenizer, reused for the worker-free JSON highlight
 * language (see `workerFreeJsonLanguage.ts`). It is a synchronous, main-thread
 * line scanner (from the bundled jsonc-parser) with no language worker, but the
 * curated Monaco build ships it without type declarations — the same situation
 * `languageServices.ts` describes for the language-service defaults. Typed here
 * against the public `languages.TokensProvider` shape it already satisfies.
 */
declare module 'monaco-editor/esm/vs/language/json/tokenization.js' {
	export function createTokenizationSupport(
		supportComments: boolean,
	): import('monaco-editor/esm/vs/editor/editor.api.js').languages.TokensProvider;
}
