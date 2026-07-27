/**
 * Monaco's built-in JSON tokenizer, reused for the worker-free JSON highlight
 * language (see `workerFreeJsonLanguage.ts`). It is a synchronous, main-thread
 * line scanner (from the bundled jsonc-parser) with no language worker, but it is
 * not one of monaco-editor's declared entry points, so it ships without type
 * declarations. Typed here against the public `languages.TokensProvider` shape it
 * already satisfies.
 */
declare module 'monaco-editor/languages/features/json/tokenization.js' {
	export function createTokenizationSupport(
		supportComments: boolean,
	): import('monaco-editor/editor').languages.TokensProvider;
}
