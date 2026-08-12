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
 * import graph still depends on. When the open file's context (project or
 * package) changes, stale models are swept — including the previously open
 * file's model, which is still attached while cleanup runs and so is swept a
 * tick later, and models left behind while browsing installed packages (where
 * no intelligence loads at all). The last real project survives a package
 * peek, so a brief detour doesn't evict and refetch its sibling set. Model
 * creation is bounded twice over — registration is budgeted by live count and
 * total size, and a ceiling on editor-created models covers browsing within
 * one context, which never triggers a sweep: unbounded model creation is a
 * listener leak (Monaco warns at 200 live models) and can OOM the language
 * worker (HarperFast/studio#1407).
 */
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import {
	acquireApplicationTypes,
	isTypeAcquisitionBudgetSpent,
} from '@/features/instance/applications/components/TextEditorView/harper-language/typeAcquisition';
import { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import {
	enforceModelCeiling,
	MAX_LIVE_APPLICATION_MODELS,
	selectFilesWithinModelBudget,
	sweepStaleApplicationModels,
} from '@/features/instance/applications/lib/modelHousekeeping';
import { getComponentFileQueryOptions } from '@/integrations/api/instance/applications/getComponentFile';
import * as monaco from '@/lib/monaco/editorApi';
import { typescript } from '@/lib/monaco/languageServices';
import { MAX_WORKER_MODEL_CHARS } from '@/lib/monaco/workerLimits';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

/** Degradation status the editor surfaces to the user (HarperFast/studio#1504). */
export interface ApplicationTypeIntelligenceStatus {
	/**
	 * The session-wide `@types` budget is spent, so further packages are no longer
	 * acquired and their imports report a spurious "cannot find module".
	 */
	typeAcquisitionBudgetExhausted: boolean;
}

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
	const { typescriptDefaults, javascriptDefaults } = typescript;
	for (const defaults of [typescriptDefaults, javascriptDefaults]) {
		defaults.setCompilerOptions({ ...defaults.getCompilerOptions(), baseUrl, paths });
	}
}

/**
 * The project whose models the (single) applications editor currently wants
 * kept. Module-level because the deferred sweep scheduled in an effect's
 * cleanup must honor the project the NEXT effect run claims, not the one being
 * torn down; after a real unmount nothing re-claims it, so the deferred sweep
 * releases everything.
 */
let activeIntelligenceProject: string | undefined;

/**
 * The (percent-encoded) URI prefix all of a project's models share. Built via
 * `monaco.Uri` so a project name that needs encoding still matches the
 * `uri.toString()` output the sweep compares against.
 */
function projectUriPrefix(project: string | undefined): string | undefined {
	return project === undefined ? undefined : monaco.Uri.parse(`file:///${project}/`).toString();
}

export function useApplicationTypeIntelligence(
	openedEntry: AnyEntry | undefined,
	rootEntries: AnyEntry[],
): ApplicationTypeIntelligenceStatus {
	const instanceParams = useInstanceClientIdParams();
	const queryClient = useQueryClient();

	// The budget is module-level and monotonic, so seed from it: a file opened
	// after a prior project already exhausted the budget shows the notice at once,
	// without waiting for another (short-circuited) acquisition pass.
	const [typeAcquisitionBudgetExhausted, setTypeAcquisitionBudgetExhausted] = useState(isTypeAcquisitionBudgetSpent);

	// Only intelligence-load the user's own applications. Installed packages can
	// be large dependency trees and are read-only.
	const project = openedEntry && !openedEntry.package ? openedEntry.project : undefined;
	// The top-level entry the open file lives under — set for installed packages
	// too. Context changes re-run the housekeeping effect so models the editor
	// accumulated in the previous context (via `keepCurrentModel`) get swept
	// even where no intelligence loads.
	const context = openedEntry?.project;

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

	// The last real project opened, kept across package peeks so a brief detour
	// into an installed package doesn't evict the project's sibling models.
	const lastProjectRef = useRef<string | undefined>(undefined);

	useEffect(() => {
		// While peeking at an installed package (or with no file open) keep the
		// last real project's models alive: the user usually comes right back,
		// and evicting the sibling set would force a full refetch on return.
		const keepProject = project ?? lastProjectRef.current;
		if (project) {
			lastProjectRef.current = project;
		}
		activeIntelligenceProject = keepProject;
		// The previous context's models are stale now. Sweep everything that is
		// not the kept project's and not on screen — including models the editor
		// kept (`keepCurrentModel`) for files of other projects and packages.
		sweepStaleApplicationModels(monaco.editor.getModels(), projectUriPrefix(keepProject));

		// No context switch ever fires while browsing within one project (or one
		// package), so models the editor creates on its own — files the budget
		// skipped, peeked library declarations — would grow the population
		// without bound. Retire the oldest detached models as new ones appear.
		const ceilingEnforcer = monaco.editor.onDidCreateModel(created => {
			enforceModelCeiling(monaco.editor.getModels(), created.uri.toString(), MAX_LIVE_APPLICATION_MODELS);
		});

		let cancelled = false;

		if (project && sourceFiles.length > 0) {
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

				// Seed the budget with everything already alive — this project's
				// prior registrations, editor-created models, peeked library
				// declarations — so batches can't stack past the tab-wide limits.
				let alreadyLiveModels = 0;
				let alreadyLiveChars = 0;
				for (const model of monaco.editor.getModels()) {
					if (model.uri.toString().startsWith('file:///')) {
						alreadyLiveModels++;
						alreadyLiveChars += model.getValueLength();
					}
				}
				const registrable: LoadedFile[] = [];
				for (const file of loaded) {
					if (file.appPath === openPathRef.current) {
						continue;
					}
					// Don't register oversized files: their full text would be cloned to
					// the language worker (see MAX_WORKER_MODEL_CHARS) and can crash it.
					if (file.content.length > MAX_WORKER_MODEL_CHARS) {
						continue;
					}
					const existing = monaco.editor.getModel(monaco.Uri.parse(`file:///${file.appPath}`));
					if (existing) {
						// A kept model can outlive its file's content (e.g. the file was
						// deleted and recreated) — refresh it, unless the editor owns it.
						if (!existing.isAttachedToEditor() && existing.getValue() !== file.content) {
							existing.setValue(file.content);
						}
						continue;
					}
					registrable.push(file);
				}
				const { selected, dropped } = selectFilesWithinModelBudget(registrable, alreadyLiveModels, alreadyLiveChars);
				for (const file of selected) {
					const uri = monaco.Uri.parse(`file:///${file.appPath}`);
					monaco.editor.createModel(file.content, modelLanguage(file.appPath), uri);
				}
				if (dropped > 0) {
					console.info(
						`[harper] type intelligence: skipped ${dropped} of ${registrable.length} project files (model budget)`,
					);
				}

				const tsconfig = loaded.find(file => TSCONFIG.test(file.fileWithinProject));
				applyProjectPathConfig(project, tsconfig?.content);

				// Acquire npm @types for the packages these files import. Scan scripts
				// only — declaration and JSON files don't introduce new dependencies.
				const scriptSources = loaded
					.filter(file =>
						/\.(tsx?|jsx?|mjs|cjs|mts|cts)$/i.test(file.appPath) && !/\.d\.ts$/i.test(file.appPath)
						&& file.content.length <= MAX_WORKER_MODEL_CHARS
					)
					.map(file => file.content);
				await acquireApplicationTypes(scriptSources);
				// The pass may have just sealed the budget; surface the current state
				// so the editor can show (or keep) the degradation notice.
				if (!cancelled) {
					setTypeAcquisitionBudgetExhausted(isTypeAcquisitionBudgetSpent());
				}
			})();
		}

		return () => {
			cancelled = true;
			ceilingEnforcer.dispose();
			activeIntelligenceProject = undefined;
			// The open file's model is still attached while this cleanup runs (the
			// editor swaps or disposes it afterwards), so it can't be swept here —
			// sweep a tick later, by which time the next effect run (if any) has
			// claimed its own project via `activeIntelligenceProject`.
			setTimeout(() => {
				sweepStaleApplicationModels(monaco.editor.getModels(), projectUriPrefix(activeIntelligenceProject));
			}, 0);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [project, context, filesKey]);

	return { typeAcquisitionBudgetExhausted };
}
