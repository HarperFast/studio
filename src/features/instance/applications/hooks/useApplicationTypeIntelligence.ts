/**
 * Teaches the Monaco TypeScript/JavaScript worker about the *rest* of the
 * application whose file is currently open, so cross-module imports resolve
 * instead of erroring with "cannot find module".
 *
 * The worker only sees the models that exist. Out of the box that is a single
 * model — the open file — so `import { increment } from '@/counter.ts'` has
 * nothing to resolve against. While a file is open this hook:
 *
 *   1. fetches the application's other source files and registers each as a
 *      Monaco model at its real `file:///<project>/<path>` URI, and
 *   2. maps the project's path alias (read from its `tsconfig.json`/`jsconfig`
 *      when present, else the near-universal `@/*` -> `src/*` Vite convention).
 *
 * Third-party `@types` (e.g. `react`) are acquired separately by
 * `acquireApplicationTypes`. The static, instance-wide compiler options live in
 * `registerHarperTypescript`.
 *
 * Model lifecycle: the open file's model is owned by `@monaco-editor/react`; we
 * only create the siblings, and the editor is mounted with `keepCurrentModel`
 * so navigating between an application's files does not dispose models the
 * import graph still depends on. We dispose the models we created when the
 * project changes.
 */
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { acquireApplicationTypes } from '@/features/instance/applications/components/TextEditorView/harper-language/typeAcquisition';
import { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { getComponentFileQueryOptions } from '@/integrations/api/instance/applications/getComponentFile';
import { useQueryClient } from '@tanstack/react-query';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { useEffect, useMemo, useRef } from 'react';

/** Source files worth registering as models (everything the worker can parse). */
const LOADABLE_SOURCE = /\.(tsx?|jsx?|mjs|cjs|mts|cts|json)$/i;
const TSCONFIG = /(^|\/)(tsconfig.*|jsconfig)\.json$/i;
/** Directories never worth loading: build output, vendored deps, VCS metadata. */
const IGNORED_DIR = /^(node_modules|dist|build|out|coverage|\.git|\.next|\.turbo|\.cache)$/i;
/** Generated lockfiles — large and useless to the type system. */
const IGNORED_FILE = /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i;
/** Cap simultaneous file fetches so large projects don't flood the connection pool. */
const FETCH_CONCURRENCY = 5;

type AnyEntry = DirectoryEntry | FileEntry;

interface LoadedFile {
	/** Full application path, e.g. `wow/src/counter.ts`. */
	appPath: string;
	/** Path within the project (no leading project segment), e.g. `src/counter.ts`. */
	fileWithinProject: string;
	content: string;
}

function modelLanguage(path: string): string {
	if (/\.json$/i.test(path)) {
		return 'json';
	}
	if (/\.(jsx?|mjs|cjs)$/i.test(path)) {
		return 'javascript';
	}
	return 'typescript';
}

/** Collect every loadable source file under a top-level application. */
function collectProjectSourceFiles(rootEntries: AnyEntry[], project: string): string[] {
	const root = rootEntries.find(entry => entry.name === project);
	if (!root || !isDirectory(root)) {
		return [];
	}
	const out: string[] = [];
	const walk = (entries: AnyEntry[]) => {
		for (const entry of entries) {
			if (isDirectory(entry)) {
				if (!IGNORED_DIR.test(entry.name)) {
					walk(entry.entries);
				}
			} else if (LOADABLE_SOURCE.test(entry.path) && !IGNORED_FILE.test(entry.name)) {
				out.push(entry.path);
			}
		}
	};
	walk(root.entries);
	return out;
}

/** Strip `//` and `/* *‍/` comments without mangling string contents. */
function stripJsonComments(text: string): string {
	return text.replace(
		/"(?:\\.|[^"\\])*"|\/\/[^\n\r]*|\/\*[\s\S]*?\*\//g,
		match => (match.startsWith('"') ? match : ''),
	);
}

function joinUri(base: string, relative: string): string {
	if (!relative || relative === '.' || relative === './') {
		return base;
	}
	return `${base}/${relative.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '')}`;
}

/**
 * Resolve the project's path-alias config into Monaco compiler options. Reads
 * the application's own `tsconfig.json` when available; otherwise applies the
 * `@/*` -> `src/*` convention so the common case resolves with zero config.
 */
function deriveProjectPathConfig(
	project: string,
	tsconfigText: string | undefined,
): { baseUrl: string; paths: Record<string, string[]> } {
	const projectRoot = `file:///${project}`;
	let baseUrl = projectRoot;
	let paths: Record<string, string[]> = { '@/*': ['src/*'] };
	if (tsconfigText) {
		try {
			const parsed = JSON.parse(stripJsonComments(tsconfigText)) as {
				compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
			};
			const compilerOptions = parsed.compilerOptions ?? {};
			if (compilerOptions.baseUrl) {
				baseUrl = joinUri(projectRoot, compilerOptions.baseUrl);
			}
			if (compilerOptions.paths && typeof compilerOptions.paths === 'object') {
				paths = compilerOptions.paths;
			}
		} catch {
			// Malformed or `extends`-based tsconfig — fall back to the convention.
		}
	}
	return { baseUrl, paths };
}

function applyProjectPathConfig(project: string, tsconfigText: string | undefined): void {
	const { baseUrl, paths } = deriveProjectPathConfig(project, tsconfigText);
	const { typescriptDefaults, javascriptDefaults } = monaco.languages.typescript;
	for (const defaults of [typescriptDefaults, javascriptDefaults]) {
		defaults.setCompilerOptions({ ...defaults.getCompilerOptions(), baseUrl, paths });
	}
}

export function useApplicationTypeIntelligence(openedEntry: AnyEntry | undefined, rootEntries: AnyEntry[]): void {
	const instanceParams = useInstanceClientIdParams();
	const queryClient = useQueryClient();

	// Only intelligence-load the user's own applications. Installed packages can
	// be large dependency trees and are read-only.
	const project = openedEntry && !openedEntry.package ? openedEntry.project : undefined;

	const sourceFiles = useMemo(
		() => (project ? collectProjectSourceFiles(rootEntries, project) : []),
		[rootEntries, project],
	);
	// A stable signature so the effect only re-runs when the file set changes,
	// not on every tree refresh (e.g. after a save).
	const filesKey = useMemo(() => sourceFiles.join('|'), [sourceFiles]);

	// The open file's model belongs to the editor; never recreate or clobber it.
	const openPathRef = useRef<string | undefined>(undefined);
	openPathRef.current = openedEntry?.path;

	useEffect(() => {
		if (!project || sourceFiles.length === 0) {
			return;
		}
		let cancelled = false;

		void (async () => {
			// Fetch with a small concurrency cap rather than all at once, so large
			// projects don't open dozens of simultaneous requests. Files are
			// best-effort: a failed fetch is skipped, not fatal.
			const loaded: LoadedFile[] = [];
			const queue = [...sourceFiles];
			const fetchNext = async (): Promise<void> => {
				while (!cancelled) {
					const appPath = queue.shift();
					if (!appPath) {
						return;
					}
					const fileWithinProject = appPath.split('/').slice(1).join('/');
					try {
						const response = await queryClient.fetchQuery(
							getComponentFileQueryOptions({ ...instanceParams, project, file: fileWithinProject }),
						);
						loaded.push({ appPath, fileWithinProject, content: response.message ?? '' });
					} catch {
						// Skip files that fail to load.
					}
				}
			};
			await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, sourceFiles.length) }, fetchNext));
			if (cancelled) {
				return;
			}

			for (const file of loaded) {
				if (file.appPath === openPathRef.current) {
					continue;
				}
				const uri = monaco.Uri.parse(`file:///${file.appPath}`);
				if (monaco.editor.getModel(uri)) {
					continue;
				}
				monaco.editor.createModel(file.content, modelLanguage(file.appPath), uri);
			}

			const tsconfig = loaded.find(file => TSCONFIG.test(file.fileWithinProject));
			applyProjectPathConfig(project, tsconfig?.content);

			// Acquire npm @types for the packages these files import. Scan scripts
			// only — declaration and JSON files don't introduce new dependencies.
			const scriptSources = loaded
				.filter(file => /\.(tsx?|jsx?|mjs|cjs|mts|cts)$/i.test(file.appPath) && !/\.d\.ts$/i.test(file.appPath))
				.map(file => file.content);
			void acquireApplicationTypes(scriptSources);
		})();

		return () => {
			cancelled = true;
			// Dispose this project's models (ours and any the editor opened) so
			// switching applications doesn't accumulate stale models. Leave any
			// model the editor is currently showing.
			const prefix = `file:///${project}/`;
			for (const model of monaco.editor.getModels()) {
				if (model.uri.toString().startsWith(prefix) && !model.isAttachedToEditor()) {
					model.dispose();
				}
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [project, filesKey]);
}
