import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	// Monaco's language workers (bundled locally — see src/lib/monaco/setup.ts) are ES
	// modules; the default 'iife' worker format breaks them.
	worker: {
		format: 'es',
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
		// (~2.2 MB, lazy <MonacoEditor>), swagger-ui (API docs route) and mermaid
		// (markdown diagrams) — and can't be split further without loading them all
		// anyway. Monaco's language workers are larger still but run off-thread and
		// don't count toward this limit. Raise the threshold above the largest of
		// these so the warning only fires on genuinely new bloat.
		chunkSizeWarningLimit: 2500,
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
});
