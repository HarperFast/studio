import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
	build: {
		outDir: 'web',
		emptyOutDir: true,
		sourcemap: true,
		rollupOptions: {
			external: ['**/*.test.*', '**/*.spec.*'],
			output: {
				chunkFileNames: 'assets/[name]-[hash].js',
				entryFileNames: 'assets/[name]-[hash].js',
				assetFileNames: 'assets/[name]-[hash].[ext]',
				manualChunks(id) {
					if (id.includes('node_modules')) {
						if (id.includes('react') || id.includes('scheduler')) {
							return 'vendor-react';
						}
						if (id.includes('@tanstack')) {
							return 'vendor-tanstack';
						}
						if (id.includes('lucide-react')) {
							return 'vendor-lucide';
						}
						if (
							id.includes('mermaid') || id.includes('d3') || id.includes('dagre') || id.includes('cytoscape')
							|| id.includes('roughjs')
						) {
							return 'vendor-viz';
						}
						if (
							id.includes('swagger-ui-react') || id.includes('swagger-client') || id.includes('braintree-web-webhook')
						) {
							return 'vendor-swagger';
						}
						if (id.includes('recharts')) {
							return 'vendor-charts';
						}
						if (
							id.includes('axios') || id.includes('zod') || id.includes('lodash') || id.includes('ajv')
							|| id.includes('class-variance-authority') || id.includes('clsx') || id.includes('tailwind-merge')
						) {
							return 'vendor-core';
						}
						if (
							id.includes('@radix-ui') || id.includes('vaul') || id.includes('cmdk') || id.includes('sonner')
							|| id.includes('react-hook-form') || id.includes('@hookform/resolvers')
						) {
							return 'vendor-ui';
						}
						if (id.includes('@monaco-editor') || id.includes('monaco-editor')) {
							return 'vendor-monaco';
						}
						if (id.includes('@stripe')) {
							return 'vendor-stripe';
						}
						if (id.includes('@datadog')) {
							return 'vendor-datadog';
						}
						if (id.includes('react-complex-tree')) {
							return 'vendor-tree';
						}
						if (id.includes('react-dropzone')) {
							return 'vendor-dropzone';
						}
						if (id.includes('recharts') || id.includes('d3') || id.includes('victory') || id.includes('prop-types')) {
							return 'vendor-charts';
						}
						if (
							id.includes('react-markdown') || id.includes('remark-') || id.includes('micromark')
							|| id.includes('vfile') || id.includes('unist-') || id.includes('decode-named-character-reference')
							|| id.includes('mdast-util-') || id.includes('ccount') || id.includes('character-entities')
							|| id.includes('escape-string-regexp') || id.includes('markdown-table')
						) {
							return 'vendor-markdown';
						}
						if (id.includes('reodotdev') || id.includes('property-information') || id.includes('hast-util-')) {
							return 'vendor-html';
						}
						return 'vendor-misc';
					}
				},
			},
		},
	},
});
