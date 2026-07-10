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
 * This module has side effects and must run before the first `<Editor>` mounts,
 * so it is imported at the top of `main.tsx`.
 */
import { reportPossibleStaleDeploy } from '@/lib/installStaleDeployReload';
import { loader } from '@monaco-editor/react';
// Typed Monaco API namespace.
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
// Editor runtime: core + all editor features (find, folding, suggest, hover,
// command palette, …). `edcore.main` re-exports `editor.api`, so this adds the
// feature contributions on top of the namespace imported above — without
// Monaco's bundled languages.
import 'monaco-editor/esm/vs/editor/edcore.main.js';
// Rich language services (IntelliSense + diagnostics, each backed by a worker).
import 'monaco-editor/esm/vs/language/css/monaco.contribution.js';
import 'monaco-editor/esm/vs/language/html/monaco.contribution.js';
import 'monaco-editor/esm/vs/language/json/monaco.contribution.js';
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution.js';
// Syntax highlighting (Monarch grammars). TS/JS need these for highlighting
// (their language service only adds IntelliSense); CSS/HTML round out the
// grammar alongside their services; Markdown, YAML, and XML are highlighting-only
// here (YAML schema features come from monaco-yaml; XML backs the SVG source
// editor with no worker/validation of its own).
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/graphql/graphql.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js';
// Workers (Vite-bundled).
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
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

// Point @monaco-editor/react at the locally bundled Monaco rather than the CDN.
loader.config({ monaco });

// Dev-only convenience: expose the Monaco instance for debugging in the console.
// (When CDN-loaded, Monaco set `window.monaco` itself; the bundled module does not.)
if (import.meta.env.DEV) {
	(globalThis as typeof globalThis & { monaco?: typeof monaco }).monaco = monaco;
}
