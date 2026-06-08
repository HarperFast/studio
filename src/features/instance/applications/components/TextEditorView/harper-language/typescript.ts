/**
 * Harper-aware TypeScript / JavaScript support for Monaco. Feeds the language
 * worker a curated ambient declaration so the Harper globals (`tables`,
 * `server`, `Resource`, …) and the `harper` module resolve with IntelliSense
 * instead of erroring as undefined, and relaxes the compiler options so Harper
 * component files (ESM, top-level await, mixed .js/.ts) type-check cleanly.
 */
import { OnMount } from '@monaco-editor/react';
import { harperGlobalsDeclaration } from './harperGlobals';

type Monaco = Parameters<OnMount>[1];

const HARPER_GLOBALS_PATH = 'file:///node_modules/@types/harper-globals/index.d.ts';

export function registerHarperTypescript(monaco: Monaco): void {
	const { typescriptDefaults, javascriptDefaults, ScriptTarget, ModuleKind, ModuleResolutionKind } =
		monaco.languages.typescript;

	for (const defaults of [typescriptDefaults, javascriptDefaults]) {
		defaults.addExtraLib(harperGlobalsDeclaration, HARPER_GLOBALS_PATH);
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
		});
	}
}
