/**
 * Typed access to Monaco's TypeScript/JavaScript and JSON language-service
 * defaults for our curated build.
 *
 * monaco-editor 0.55 moved these defaults off the `monaco.languages` namespace
 * — now deprecated no-op stubs on the `editor.api` entry — to top-level
 * `typescript` / `json` namespaces. The package's main entry (`monaco-editor`)
 * re-exports those namespaces, but it also bundles all ~90 languages, so it is
 * off-limits here (it would defeat the curated build; see `./setup`).
 *
 * 0.56 made that a non-problem: each language feature now has its own public
 * `register` entry point that exports the very same singletons *with* real type
 * declarations — so this is a plain re-export, pulling in no extra languages.
 * These are the same modules `./setup` imports for their registration side
 * effects; naming them once here keeps the "don't reach for the main entry"
 * rationale in one place.
 */
export * as json from 'monaco-editor/languages/features/json/register';
export * as typescript from 'monaco-editor/languages/features/typescript/register';
