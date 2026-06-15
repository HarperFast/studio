/**
 * Harper-aware TypeScript / JavaScript support for Monaco. Feeds the language
 * worker a curated ambient declaration so the Harper globals (`tables`,
 * `server`, `Resource`, …) and the `harper` module resolve with IntelliSense
 * instead of erroring as undefined, and relaxes the compiler options so Harper
 * component files (ESM, top-level await, mixed .js/.ts) type-check cleanly.
 *
 * This handles the static, instance-global setup that applies to every file.
 * Per-application concerns — loading a project's sibling files as models so
 * cross-module imports resolve, mapping its `@/` path alias, and acquiring npm
 * `@types` — live in `useApplicationTypeIntelligence`, which runs while a file
 * is open.
 */
import { typescript } from '@/lib/monaco/languageServices';
import { harperGlobalsDeclaration } from './harperGlobals';

const HARPER_GLOBALS_PATH = 'file:///node_modules/@types/harper-globals/index.d.ts';
const ASSET_MODULES_PATH = 'file:///node_modules/@types/harper-assets/index.d.ts';

/**
 * Ambient declarations for the non-code imports a bundler (Vite) understands but
 * the type system does not: static assets resolve to a URL string, stylesheets
 * to a CSS-modules record. Without these, `import logo from './logo.svg'` and
 * friends report a spurious "cannot find module".
 */
const assetModuleDeclarations = `
declare module '*.svg' { const url: string; export default url; }
declare module '*.png' { const url: string; export default url; }
declare module '*.jpg' { const url: string; export default url; }
declare module '*.jpeg' { const url: string; export default url; }
declare module '*.gif' { const url: string; export default url; }
declare module '*.webp' { const url: string; export default url; }
declare module '*.avif' { const url: string; export default url; }
declare module '*.ico' { const url: string; export default url; }
declare module '*.bmp' { const url: string; export default url; }
declare module '*.css' { const classes: { readonly [name: string]: string }; export default classes; }
declare module '*.scss' { const classes: { readonly [name: string]: string }; export default classes; }
declare module '*.sass' { const classes: { readonly [name: string]: string }; export default classes; }
declare module '*.less' { const classes: { readonly [name: string]: string }; export default classes; }
declare module '*?raw' { const content: string; export default content; }
declare module '*?url' { const url: string; export default url; }
`;

export function registerHarperTypescript(): void {
	const { typescriptDefaults, javascriptDefaults, ScriptTarget, ModuleKind, ModuleResolutionKind, JsxEmit } =
		typescript;

	for (const defaults of [typescriptDefaults, javascriptDefaults]) {
		defaults.addExtraLib(harperGlobalsDeclaration, HARPER_GLOBALS_PATH);
		defaults.addExtraLib(assetModuleDeclarations, ASSET_MODULES_PATH);
		// Let the worker see every model we create (a project's sibling files),
		// not just the one the editor currently has open, so imports between an
		// application's own files resolve.
		defaults.setEagerModelSync(true);
		defaults.setCompilerOptions({
			...defaults.getCompilerOptions(),
			target: ScriptTarget.ESNext,
			module: ModuleKind.ESNext,
			moduleResolution: ModuleResolutionKind.NodeJs,
			allowJs: true,
			allowNonTsExtensions: true,
			esModuleInterop: true,
			skipLibCheck: true,
			noEmit: true,
			// Components are full of JSX/TSX and aliased, extension-qualified
			// imports (`@/counter.ts`); accept both. `preserve` type-checks JSX
			// without requiring a JSX runtime to be resolvable up front.
			jsx: JsxEmit.Preserve,
			allowImportingTsExtensions: true,
			resolveJsonModule: true,
		});
	}
}
