/**
 * Automatic Type Acquisition (ATA) for the Applications editor: fetch the
 * `@types` (or bundled declarations) for the third-party packages an
 * application imports — `react`, `react-dom`, and so on — from the jsDelivr CDN
 * and feed them to Monaco's TypeScript worker. Without this, npm imports report
 * a spurious "cannot find module".
 *
 * We reuse `@typescript/ata` (the engine behind the TypeScript Playground) for
 * the hard part: walking a package's declaration graph on the CDN, including
 * transitive `@types`. It only touches `typescript` to scan a file's imports via
 * `preProcessFile`, so we hand it a tiny regex shim instead of shipping the
 * multi-megabyte `typescript` package to the browser.
 *
 * Everything here is lazy and best-effort: the engine loads (a code-split
 * chunk) only once a real application file is open, and any failure — offline,
 * blocked CDN, unknown package — is swallowed so it can never break editing.
 */
import { typescript } from '@/lib/monaco/languageServices';
import { canAdmitExtraLib } from '@/lib/monaco/workerLimits';

/** node builtins are not on npm; their types come from `@types/node` (not acquired here). */
const NODE_BUILTINS = new Set([
	'assert',
	'async_hooks',
	'buffer',
	'child_process',
	'cluster',
	'console',
	'crypto',
	'dns',
	'events',
	'fs',
	'http',
	'http2',
	'https',
	'module',
	'net',
	'os',
	'path',
	'perf_hooks',
	'process',
	'querystring',
	'readline',
	'stream',
	'string_decoder',
	'timers',
	'tls',
	'tty',
	'url',
	'util',
	'v8',
	'vm',
	'worker_threads',
	'zlib',
]);
const ASSET_OR_DATA = /\.(svg|png|jpe?g|gif|webp|avif|ico|bmp|css|scss|sass|less|json|wasm|txt|md|html)$/i;

/** A bare npm specifier we want real `@types` for — not relative, alias, asset, Harper, or node builtin. */
function isAcquirablePackage(specifier: string): boolean {
	if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('@/')) {
		return false;
	}
	if (specifier === 'harper' || specifier === 'harperdb' || specifier.startsWith('node:')) {
		return false;
	}
	return !NODE_BUILTINS.has(specifier) && !ASSET_OR_DATA.test(specifier);
}

const IMPORT_SPECIFIER =
	/(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]|(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;
const REFERENCE_PATH = /\/\/\/\s*<reference\s+path\s*=\s*['"]([^'"]+)['"]/g;

/**
 * Minimal stand-in for the sliver of `typescript` that `@typescript/ata` uses:
 * it calls `preProcessFile` to discover a file's module imports and its
 * `/// <reference path>` directives (needed to pull a package's other
 * declaration files, e.g. React's `global.d.ts`). We return only the npm
 * specifiers worth acquiring; relative paths within a package pass through.
 */
function createImportScannerShim(): unknown {
	return {
		libMap: new Map<string, string>(),
		preProcessFile(code: string) {
			const importedFiles: Array<{ fileName: string; pos: number; end: number }> = [];
			for (const match of code.matchAll(IMPORT_SPECIFIER)) {
				const specifier = match[1] ?? match[2] ?? match[3];
				if (specifier && isAcquirablePackage(specifier)) {
					const pos = match.index ?? 0;
					importedFiles.push({ fileName: specifier, pos, end: pos + match[0].length });
				}
			}
			const referencedFiles: Array<{ fileName: string; pos: number; end: number }> = [];
			for (const match of code.matchAll(REFERENCE_PATH)) {
				const pos = match.index ?? 0;
				referencedFiles.push({ fileName: match[1], pos, end: pos + match[0].length });
			}
			return {
				referencedFiles,
				importedFiles,
				libReferenceDirectives: [],
				typeReferenceDirectives: [],
				ambientExternalModules: [],
				isLibFile: false,
			};
		},
	};
}

let runnerPromise: Promise<(source: string) => Promise<void>> | undefined;
const acquiredPaths = new Set<string>();
/**
 * Running total of chars handed to the worker as extra libs. Session-lifetime
 * and monotonic — it mirrors the extra libs actually live on the shared
 * `typescriptDefaults`/`javascriptDefaults` singletons, which are never removed
 * — so once the budget is spent it stays spent, which is exactly the backstop
 * against unbounded cross-project accumulation (HarperFast/studio#1499).
 */
let acquiredChars = 0;

function getRunner(): Promise<(source: string) => Promise<void>> {
	if (!runnerPromise) {
		runnerPromise = import('@typescript/ata').then(({ setupTypeAcquisition }) => {
			const { typescriptDefaults, javascriptDefaults } = typescript;
			return setupTypeAcquisition({
				projectName: 'Harper Application',
				typescript: createImportScannerShim() as unknown as typeof import('typescript'),
				delegate: {
					receivedFile(code: string, path: string) {
						if (acquiredPaths.has(path)) {
							return;
						}
						// Mark it seen even when rejected, so a skipped lib isn't
						// reconsidered on every subsequent acquisition pass.
						acquiredPaths.add(path);
						// Extra libs are eagerly cloned to the language worker
						// (setEagerModelSync) and never swept; bound the total so a
						// large or deep dependency graph — or a long multi-project
						// session — can't OOM the worker's clone buffer (#1499).
						if (!canAdmitExtraLib(acquiredChars, code.length)) {
							return;
						}
						acquiredChars += code.length;
						const uri = `file://${path}`;
						typescriptDefaults.addExtraLib(code, uri);
						javascriptDefaults.addExtraLib(code, uri);
					},
				},
			});
		});
	}
	return runnerPromise;
}

/**
 * Acquire npm `@types` for every package imported across the given source files.
 * Best-effort and idempotent; safe to call on each project load.
 */
export async function acquireApplicationTypes(sources: string[]): Promise<void> {
	if (sources.length === 0) {
		return;
	}
	try {
		const run = await getRunner();
		// One pass: the shim scans the combined source for every import at once.
		await run(sources.join('\n;\n'));
	} catch (error) {
		console.warn('[harper] type acquisition unavailable', error);
	}
}
