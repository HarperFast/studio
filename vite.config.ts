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
	esbuild: {
		minifyIdentifiers: false, // Prevents renaming of identifiers
		keepNames: true, // Also keeps function/class names
		sourcemap: 'external',
	},
	build: {
		outDir: 'web',
		minify: 'esbuild', // esbuild is default but good to be explicit
		emptyOutDir: true,
		sourcemap: true,
		rollupOptions: {
			external: ['**/*.test.*', '**/*.spec.*'],
		},
	},
});
