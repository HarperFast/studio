---
name: serving-web-content
description: How to serve static files and integrated Vite/React applications in Harper.
metadata:
  mode: synthesized
---

# Serving Web Content

Instructions for the agent to follow when serving web content from Harper.

## When to Use

Use this skill when you need to serve a frontend (HTML, CSS, JS, or a React app) directly from your Harper instance.

## How It Works

1. **Choose a Method**: Decide between the simple Static Plugin or the integrated Vite Plugin.
2. **Option A: Static Plugin (Simple)**:
   - Add to `config.yaml`:
     ```yaml
     static:
       files: 'web/*'
     ```
   - Place files in a `web/` folder in the project root.
   - Files are served at the root URL (e.g., `http://localhost:9926/index.html`).
3. **Option B: Vite Plugin (Advanced/Development)**:
   - Add to `config.yaml`:
     ```yaml
     '@harperfast/vite-plugin':
       package: '@harperfast/vite-plugin'
     ```
   - Ensure `vite.config.ts` and `index.html` are in the project root.

   ```javascript
   import vue from '@vitejs/plugin-vue';
   import path from 'node:path';
   import { defineConfig } from 'vite';

   // https://vite.dev/config/
   export default defineConfig({
   	plugins: [vue()],
   	resolve: {
   		alias: {
   			'@': path.resolve(import.meta.dirname, './src'),
   		},
   	},
   	build: {
   		outDir: 'web',
   		emptyOutDir: true,
   		rolldownOptions: {
   			external: ['**/*.test.*', '**/*.spec.*'],
   		},
   	},
   });
   ```

   - Install dependencies: `npm install --save-dev vite @harperfast/vite-plugin`.
   - Then `harper run .` will start up Harper and Vite with HMR. Vite does _not_ need to be executed separately.

4. **Deploy for Production**: For Vite apps, use a build script to generate static files into a `web/` folder and deploy them using the static handler pattern. For example, these scripts in a package.json can perform the necessary steps:
   ```json
   "build": "vite build",
   "deploy": "rm -Rf deploy && npm run build && mkdir deploy && mv web deploy/ && cp -R deploy-template/* deploy/ && cp -R schemas resources deploy/ && (cd deploy && harper deploy_component . project=web restart=rolling replicated=true) && rm -Rf deploy",
   ```
   Then in production, the "Static Plugin" option will performantly and securely serve your assets. `npm create harper@latest` scaffolds all of this for you.
