/**
 * The Monaco namespace type for our self-hosted, curated editor build.
 *
 * `@monaco-editor/react` types its `onMount`/`beforeMount` `monaco` argument
 * (`Parameters<OnMount>[1]`) as `typeof import('monaco-editor/esm/vs/editor/editor.api')`.
 * In monaco-editor 0.55 that bare, extensionless specifier no longer resolves to
 * type declarations under `moduleResolution: 'bundler'` — the package's new
 * `exports` map only matches concrete file paths — so `Parameters<OnMount>[1]`
 * silently collapses to `any`, taking every Monaco-typed callback down with it.
 *
 * Pointing at the extension-qualified path restores the real types, and is also
 * the accurate runtime shape: Monaco hands us the `editor.api` namespace, not the
 * all-languages main entry. (The TS/JSON language-service defaults — moved to the
 * top-level namespaces only the main entry exposes — are reached through
 * `./languageServices`, not this type.)
 */
export type Monaco = typeof import('monaco-editor/esm/vs/editor/editor.api.js');
