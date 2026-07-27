/**
 * Self-host the Monaco editor instead of loading it from a CDN.
 *
 * `@monaco-editor/react` defaults to fetching Monaco (and its workers) from a
 * CDN at runtime. That works for highlighting, but cross-origin web workers are
 * unreliable in that mode (Monaco silently falls back to running language
 * services on the main thread), and there is no way to supply monaco-yaml's
 * worker. Bundling Monaco locally lets Vite build every language worker
 * (including YAML), so the TypeScript/JSON/YAML language services run in real
 * workers.
 *
 * This is a curated Monaco build: rather than `import 'monaco-editor'` (which
 * bundles all ~90 languages), we import the editor + all editor features, then
 * only the languages the Applications editor opens — TS/JS (+TSX/JSX), JSON,
 * CSS, HTML, Markdown, GraphQL (Harper schemas), YAML, and XML (SVG source).
 *
 * The specifiers below are monaco-editor 0.56's public, tree-shakeable entry
 * points (0.56 added an `exports` map that re-roots the package at `esm/vs`, so
 * the old `monaco-editor/esm/vs/…` deep paths no longer resolve at all).
 *
 * This module has side effects and must run before the first `<Editor>` mounts,
 * so it is imported at the top of `main.tsx`.
 */
import { reportPossibleStaleDeploy } from '@/lib/installStaleDeployReload';
import { registerWorkerFreeJsonLanguage } from '@/lib/monaco/workerFreeJsonLanguage';
import { loader } from '@monaco-editor/react';
// Typed Monaco API namespace.
import * as monaco from 'monaco-editor/editor';
// All editor features (find, folding, suggest, hover, command palette, …) on top
// of the core namespace imported above — without Monaco's bundled languages.
import 'monaco-editor/features/register.all';
// Rich language services (IntelliSense + diagnostics, each backed by a worker).
import 'monaco-editor/languages/features/css/register';
import 'monaco-editor/languages/features/html/register';
import 'monaco-editor/languages/features/json/register';
import 'monaco-editor/languages/features/typescript/register';
// Syntax highlighting (Monarch grammars). TS/JS need these for highlighting
// (their language service only adds IntelliSense); CSS/HTML round out the
// grammar alongside their services; Markdown, YAML, and XML are highlighting-only
// here (YAML schema features come from monaco-yaml; XML backs the SVG source
// editor with no worker/validation of its own).
import 'monaco-editor/languages/definitions/css/register';
import 'monaco-editor/languages/definitions/graphql/register';
import 'monaco-editor/languages/definitions/html/register';
import 'monaco-editor/languages/definitions/javascript/register';
import 'monaco-editor/languages/definitions/markdown/register';
import 'monaco-editor/languages/definitions/typescript/register';
import 'monaco-editor/languages/definitions/xml/register';
import 'monaco-editor/languages/definitions/yaml/register';
// Workers (Vite-bundled).
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import cssWorker from 'monaco-editor/languages/features/css/css.worker.js?worker';
import htmlWorker from 'monaco-editor/languages/features/html/html.worker.js?worker';
import jsonWorker from 'monaco-editor/languages/features/json/json.worker.js?worker';
import tsWorker from 'monaco-editor/languages/features/typescript/ts.worker.js?worker';
import yamlWorker from 'monaco-yaml/yaml.worker?worker';

const globalScope = globalThis as unknown as { MonacoEnvironment?: monaco.Environment };

function createLanguageWorker(label: string): Worker {
	switch (label) {
		case 'json':
			return new jsonWorker();
		case 'css':
		case 'scss':
		case 'less':
			return new cssWorker();
		case 'html':
		case 'handlebars':
		case 'razor':
			return new htmlWorker();
		case 'typescript':
		case 'javascript':
			return new tsWorker();
		case 'yaml':
			return new yamlWorker();
		default:
			return new editorWorker();
	}
}

globalScope.MonacoEnvironment = {
	getWorker(_workerId: string, label: string): Worker {
		const worker = createLanguageWorker(label);
		// A worker whose hashed chunk 404s after a redeploy fails to load and
		// fires its own `error` event — NOT Vite's `vite:preloadError`, so the
		// window listener never sees it. Left unhandled, Monaco silently swaps in
		// a degraded main-thread fallback for the rest of the session (issue
		// #1406). Route the failure into the same one-shot, rate-limited reload
		// recovery so the session heals on the fresh chunks instead.
		worker.addEventListener('error', () => reportPossibleStaleDeploy());
		return worker;
	},
};

// A JSON highlight language with no language worker, for the browse record
// editors — see `workerFreeJsonLanguage.ts`. Registered here, alongside the
// built-in `json` contribution above, so it exists before the first editor mounts.
registerWorkerFreeJsonLanguage(monaco.languages);

// Point @monaco-editor/react at the locally bundled Monaco rather than the CDN.
loader.config({ monaco });

// Dev-only convenience: expose the Monaco instance for debugging in the console.
// (When CDN-loaded, Monaco set `window.monaco` itself; the bundled module does not.)
if (import.meta.env.DEV) {
	(globalThis as typeof globalThis & { monaco?: typeof monaco }).monaco = monaco;
}
