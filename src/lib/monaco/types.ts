/**
 * The Monaco namespace type for our self-hosted, curated editor build.
 *
 * `@monaco-editor/react` types its `onMount`/`beforeMount` `monaco` argument
 * (`Parameters<OnMount>[1]`) as `typeof import('monaco-editor/esm/vs/editor/editor.api')`.
 * monaco-editor 0.56 added an `exports` map that re-roots the package at
 * `esm/vs`, so that specifier no longer resolves at all (it would have to be
 * `monaco-editor/editor/editor.api.js` now) — and with `skipLibCheck` the
 * unresolved import silently collapses `Parameters<OnMount>[1]` to `any`, taking
 * every Monaco-typed callback down with it.
 *
 * Pointing at the package's own `monaco-editor/editor` entry restores the real
 * types, and is also the accurate runtime shape: Monaco hands us the editor API
 * namespace, not the all-languages main entry. (The TS/JSON language-service
 * defaults, which only the main entry re-exports, are reached through
 * `./languageServices`, not this type.)
 */
export type Monaco = typeof import('monaco-editor/editor');
