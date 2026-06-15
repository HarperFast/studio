/**
 * Typed access to Monaco's TypeScript/JavaScript and JSON language-service
 * defaults for our curated build.
 *
 * monaco-editor 0.55 moved these defaults off the `monaco.languages` namespace
 * — now deprecated no-op stubs on the `editor.api` entry — to top-level
 * `typescript` / `json` namespaces. Those fully-typed namespaces are exported
 * only from the package's main entry (`monaco-editor`), which bundles all ~90
 * languages and so is off-limits here (it would defeat the curated build; see
 * `./setup`). The per-language contribution modules we *do* import expose the
 * very same singletons as ESM named exports — but ship empty (`export {}`) type
 * declarations.
 *
 * So: take the runtime values from the contribution modules (pulling in no extra
 * languages) and borrow the real types from the main entry via a type-only query
 * (erased at build — zero bundle cost). The two casts below are the single seam
 * where curated runtime meets full types.
 */
import * as jsonContribution from 'monaco-editor/esm/vs/language/json/monaco.contribution.js';
import * as typescriptContribution from 'monaco-editor/esm/vs/language/typescript/monaco.contribution.js';

export const typescript = typescriptContribution as unknown as typeof import('monaco-editor').typescript;
export const json = jsonContribution as unknown as typeof import('monaco-editor').json;
