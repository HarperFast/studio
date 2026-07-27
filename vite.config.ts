import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Fix the monaco-yaml language worker dropping every provider call (studio#1376).
 *
 * monaco-yaml runs its YAML language service in a web worker, bootstrapped by
 * `monaco-worker-manager`. That bootstrap (node_modules/monaco-worker-manager/worker.js)
 * imports Monaco's `initialize` from `monaco-editor/esm/vs/editor/editor.worker.js`.
 *
 * `editor.worker.js` is meant to be Monaco's *default* editor worker, so it has a
 * top-level side effect: it installs a `self.onmessage` handler that boots the worker
 * with an EMPTY foreign module (`start(() => ({}))`). monaco-worker-manager only wants
 * that file's `initialize` re-export and immediately overwrites `self.onmessage` with
 * its own handler — but the empty-module handler is set first, during the worker's async
 * module evaluation, so it can win the startup race. When it does, the worker exposes no
 * YAML methods and every monaco-yaml provider call rejects with
 * "Missing requestHandler or method: <getFoldingRanges|findDocumentSymbols|findLinks|doValidation|getCodeAction>".
 *
 * Monaco's own language workers (css/json/html/ts) sidestep this by importing the
 * identical `initialize` from `monaco-editor/internal/common/initialize.js`, which has no
 * such side effect. We rewrite monaco-worker-manager's import to point there too. This is
 * the only consumer of `editor.worker.js`'s `initialize` re-export; the default editor
 * worker still imports `editor.worker.js` directly and keeps its (correct) empty module.
 *
 * As of monaco-editor 0.56 the rewrite is load-bearing for a second reason: the package's
 * new `exports` map re-roots everything at `esm/vs`, so monaco-worker-manager's hard-coded
 * `monaco-editor/esm/vs/…` specifier no longer resolves at all (it would double the prefix).
 * 0.56 also guards the empty-module boot behind `isWorkerInitialized()`, but that flag is
 * only set once monaco's `initialize` has run — which for monaco-worker-manager happens on
 * the first message, i.e. after the race window — so the workaround still stands on its own.
 *
 * Done at build time rather than via a node_modules patch because the install is shared
 * across git worktrees. monaco-worker-manager is unmaintained at 2.0.1 (no upstream fix).
 * The transform throws if the expected import disappears so a dependency bump can't
 * silently reintroduce the bug.
 *
 * Registered in BOTH `plugins` and `worker.plugins` because the two commands reach worker
 * modules through different pipelines: `vite build` bundles each worker with `worker.plugins`
 * only, while `vite dev` serves `?worker_file` modules through the main pipeline, where only
 * the top-level `plugins` run. Registering just one of them leaves the other command broken
 * — and under 0.56 that is a hard "Failed to resolve import" for the whole YAML worker, not
 * the subtle provider-drop of #1376. Only one copy matches per command (the main graph never
 * contains monaco-worker-manager), and the transform is idempotent regardless.
 */
function fixMonacoYamlWorkerInit(): Plugin {
	// Allow a trailing query (e.g. Vite's `?v=…` cache hash) so the match isn't
	// silently skipped when the module id carries one.
	const TARGET = /monaco-worker-manager\/worker\.js(?:\?|$)/;
	const FROM = 'monaco-editor/esm/vs/editor/editor.worker.js';
	const TO = 'monaco-editor/internal/common/initialize.js';
	return {
		name: 'fix-monaco-yaml-worker-init',
		enforce: 'pre',
		transform(code, id) {
			if (!TARGET.test(id.replace(/\\/g, '/'))) { return null; }
			if (!code.includes(FROM)) {
				// Already rewritten (both plugin registrations saw this module) — leave it be.
				if (code.includes(TO)) { return null; }
				throw new Error(
					`[fix-monaco-yaml-worker-init] Expected import of "${FROM}" in monaco-worker-manager/worker.js `
						+ 'was not found — the package changed. Re-verify whether studio#1376 (empty-foreign-module '
						+ 'worker race) is still present before removing this workaround.',
				);
			}
			return { code: code.replace(FROM, TO), map: null };
		},
	};
}

// The build-mode env files (dev/stage/prod for deploys, localstudio for the
// bundled-with-harper UI) are versioned in .github/deploy-public-env to keep the
// repo root uncluttered; the developer's own .env.local stays at the root where
// Vite looks by default. Vite's envDir is global, so we point it at that folder
// only for these build modes.
const PUBLIC_ENV_MODES = new Set(['dev', 'stage', 'prod', 'localstudio']);

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
	envDir: PUBLIC_ENV_MODES.has(mode) ? path.resolve(__dirname, '.github/deploy-public-env') : undefined,
	// `fixMonacoYamlWorkerInit` is also in `worker.plugins` below; see its doc comment for
	// why it has to be registered in both places.
	plugins: [react(), tailwindcss(), fixMonacoYamlWorkerInit()],
	// Monaco's language workers (bundled locally — see src/lib/monaco/setup.ts) are ES
	// modules; the default 'iife' worker format breaks them. `plugins` here applies to the
	// worker bundles specifically — Vite does not run the top-level `plugins` against them
	// during `vite build` — which is where the monaco-yaml worker fix has to live.
	worker: {
		format: 'es',
		plugins: () => [fixMonacoYamlWorkerInit()],
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
			// monaco-yaml's worker imports path-browserify (CommonJS). Vite doesn't
			// convert CommonJS for worker-internal imports, so the YAML worker throws
			// "module is not defined" in dev. Alias it to a vendored ESM build.
			'path-browserify': path.resolve(__dirname, './src/lib/monaco/path-browserify-esm.js'),
		},
	},
	server: {
		proxy: {
			'/oauth': { target: 'http://localhost:9926/oauth', changeOrigin: true },
		},
	},
	build: {
		outDir: 'web',
		emptyOutDir: true,
		sourcemap: true,
		// Every chunk on the initial critical path is now well under 500 kB. The
		// chunks that exceed it are all loaded on demand — the Monaco editor core
		// (~2.7 MB, lazy <MonacoEditor>), swagger-ui (API docs route) and mermaid
		// (markdown diagrams) — and can't be split further without loading them all
		// anyway. Monaco's language workers are larger still but run off-thread and
		// don't count toward this limit. Raise the threshold above the largest of
		// these so the warning only fires on genuinely new bloat. (monaco-editor
		// 0.56 grew the editor core from ~2.2 MB to ~2.7 MB.)
		chunkSizeWarningLimit: 2800,
		rollupOptions: {
			external: ['**/*.test.*', '**/*.spec.*'],
			output: {
				chunkFileNames: 'assets/[name]-[hash].js',
				entryFileNames: 'assets/[name]-[hash].js',
				assetFileNames: 'assets/[name]-[hash].[ext]',
				// Only group the genuinely *eager*, app-wide libraries into named
				// vendor chunks. They load on first paint regardless, so naming them
				// costs no extra initial bytes — it just keeps this stable code in its
				// own cacheable chunk instead of churning with the app on every deploy.
				//
				// Heavy, route-specific libraries (Monaco, the AI SDK, recharts, swagger,
				// mermaid/viz, motion, katex, react-markdown, …) are deliberately NOT
				// listed: they're reachable only through dynamic imports (lazy routes,
				// the lazy <MonacoEditor> wrapper, the lazy FloatingChat), and rolldown's
				// automatic splitting keeps them in async chunks off the critical path.
				// Forcing them into manual chunks does the opposite — it promotes them to
				// eager — so leave them to auto-split.
				manualChunks(id) {
					if (!id.includes('node_modules')) { return; }

					// Resolve the npm package name from the module path so rules match on
					// exact names rather than greedy substrings. Taking the segment after
					// the LAST `node_modules/` handles pnpm's nested layout and nested
					// transitive deps alike.
					const segments = id.replace(/\\/g, '/').split('node_modules/');
					const pkg = segments[segments.length - 1].match(/^(@[^/]+\/[^/]+|[^/]+)/)?.[1] ?? '';

					if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') {
						return 'vendor-react';
					}
					if (pkg.startsWith('@tanstack')) {
						return 'vendor-tanstack';
					}
					if (
						pkg.startsWith('@radix-ui') || pkg === 'vaul' || pkg === 'cmdk' || pkg === 'sonner'
						|| pkg === 'react-hook-form' || pkg.startsWith('@hookform')
					) {
						return 'vendor-ui';
					}
					if (pkg.startsWith('@datadog')) {
						return 'vendor-datadog';
					}
					if (
						pkg === 'zod' || pkg === 'axios' || pkg === 'clsx' || pkg === 'tailwind-merge'
						|| pkg === 'class-variance-authority'
					) {
						return 'vendor-core';
					}

					// Everything else: let rolldown decide so lazy-only libraries stay lazy.
					return;
				},
			},
		},
	},
}));
