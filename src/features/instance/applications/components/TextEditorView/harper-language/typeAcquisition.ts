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
import { ExtraLibBudget } from '@/lib/monaco/workerLimits';

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

/**
 * npm's package-name grammar: an optional `@scope/`, the name itself, then an
 * optional deep-import subpath (`lodash/fp`, `react-dom/client`). Anchored and
 * whitespace-free, so a phrase lifted out of prose can never satisfy it. Matched
 * case-insensitively because a few legacy packages (`JSONStream`, `Base64`)
 * predate npm's lowercase-only rule.
 */
const NPM_SPECIFIER = /^(?:@[a-z0-9\-~][a-z0-9\-._~]*\/)?[a-z0-9\-~][a-z0-9\-._~]*(?:\/[a-z0-9\-._~/]+)?$/i;
/** npm's hard limit on a package name; also bounds what we're willing to send to the CDN. */
const MAX_SPECIFIER_LENGTH = 214;

/** A bare npm specifier we want real `@types` for — not relative, alias, asset, Harper, or node builtin. */
function isAcquirablePackage(specifier: string): boolean {
	if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('@/')) {
		return false;
	}
	if (specifier === 'harper' || specifier === 'harperdb' || specifier.startsWith('node:')) {
		return false;
	}
	if (NODE_BUILTINS.has(specifier) || ASSET_OR_DATA.test(specifier)) {
		return false;
	}
	// Every specifier that gets past here becomes a cross-origin request to
	// data.jsdelivr.com, so it must actually be able to name a package. The scanner
	// below is a regex, not a parser, and anything it over-matches out of a comment
	// or a SQL/GraphQL template literal would otherwise be sent verbatim to the CDN
	// — leaking user-authored strings (table and type names) off-origin for a
	// guaranteed 404. (HarperFast/studio: daily RUM review, 2026-07-28.)
	return specifier.length <= MAX_SPECIFIER_LENGTH && NPM_SPECIFIER.test(specifier);
}

/**
 * How far one import clause — including any single comment inside it — may extend
 * before the scanner abandons the statement. Real clauses are nowhere close: the
 * longest in this repo is 351 chars, and across ~13k declaration files in
 * `node_modules` the longest is a 1.6 KB barrel re-export, so 4 KB leaves ample
 * headroom. A clause past the bound just isn't acquired, the same degraded-but-safe
 * outcome as any unacquired package.
 *
 * The bound is what keeps the scan linear, and it is load-bearing. The clause match
 * is lazy, so without it every failed attempt runs to end-of-input and each
 * `import`/`export` occurrence pays that again: an unterminated `/*` — a mid-edit
 * save, a truncated CDN download — took ~22s on 719 KB, and a long run of
 * clause-legal characters ~2.5s on 281 KB even before comments were admitted.
 * Bounded, those same inputs scan in ~220-300ms, and real files in ~1ms. This file
 * promises failures are swallowed so they "can never break editing"; a multi-second
 * freeze of the main thread would break that promise even though nothing throws.
 *
 * A ceiling on `code.length` instead would not have fixed this — 281 KB is under any
 * sane ceiling and still took seconds — and it would drop acquisition entirely for
 * large but perfectly ordinary projects.
 */
const MAX_IMPORT_CLAUSE = 4096;

/**
 * The clause between `import`/`export` and `from` — identifiers, braces, commas,
 * `*`, `as`, whitespace (newlines included, so multi-line named imports still
 * match), and comments, which are legal and common between the braces. Everything
 * else is excluded: `=`, `:`, `(`, `)`, backticks, and a bare `/` cannot appear in
 * a real import clause, and admitting them let the lazy match run past the end of
 * a statement to reach a `from "…"` sitting in a following comment, SQL string, or
 * GraphQL block — which is how `Known Fraudster Risk` reached jsDelivr as a
 * package name.
 *
 * Each comment is matched as one indivisible unit: the line form is pinned to its
 * line end by a lookahead, and the block form cannot cross its terminator. That
 * pinning is the whole point — a plain `//[^\n]*` backtracks, so the matcher could
 * stop halfway through a comment and take the `from "…"` out of the rest of it,
 * reopening the leak on input as ordinary as `export { Dog }` followed by a
 * comment. Every alternative is bounded by `MAX_IMPORT_CLAUSE`, including the
 * comment bodies — an unterminated comment has no terminator to find, so an
 * unbounded search for one is exactly what made this quadratic.
 */
const IMPORT_CLAUSE = String.raw`(?:`
	+ String.raw`[\w$\s{},*]`
	+ String.raw`|//[^\n]{0,${MAX_IMPORT_CLAUSE}}(?=\n|$)`
	+ String.raw`|/\*(?:[^*]|\*(?!/)){0,${MAX_IMPORT_CLAUSE}}?\*/`
	+ String.raw`){0,${MAX_IMPORT_CLAUSE}}?`;
const IMPORT_SPECIFIER = new RegExp(
	String.raw`(?:import|export)\b${IMPORT_CLAUSE}\bfrom\s*['"]([^'"]+)['"]`
		+ String.raw`|(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)`
		+ String.raw`|import\s*['"]([^'"]+)['"]`,
	'g',
);
const REFERENCE_PATH = /\/\/\/\s*<reference\s+path\s*=\s*['"]([^'"]+)['"]/g;

/**
 * Every acquirable npm specifier the scanner finds in `code`, in source order.
 * Exported for tests: this is the one step that decides which names become
 * requests to jsDelivr, and it is a regex over arbitrary user code rather than a
 * real parser, so its over-match behaviour is what needs pinning down.
 */
export function findAcquirableSpecifiers(code: string): string[] {
	const found: string[] = [];
	for (const match of code.matchAll(IMPORT_SPECIFIER)) {
		const specifier = match[1] ?? match[2] ?? match[3];
		if (specifier && isAcquirablePackage(specifier)) {
			found.push(specifier);
		}
	}
	return found;
}

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
 * Bounds the chars handed to the worker as extra libs. Session-lifetime and
 * never reclaimed — the backstop against unbounded cross-project accumulation
 * that would otherwise OOM the language worker (HarperFast/studio#1499).
 */
const extraLibBudget = new ExtraLibBudget();

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
						const { admitted, justExhausted, oversize } = extraLibBudget.admit(code.length);
						if (!admitted) {
							// Leave a breadcrumb: without one, a user whose IntelliSense
							// quietly stops resolving a package has no signal why.
							if (justExhausted) {
								console.warn(
									'[harper] type acquisition: extra-lib budget exhausted; further packages will report "cannot find module" in this tab',
								);
							} else if (oversize) {
								console.debug(
									`[harper] type acquisition: skipped oversized declaration ${path} (${code.length} chars)`,
								);
							}
							return;
						}
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
 * Whether this session's automatic type-acquisition budget is exhausted. Once
 * true it stays true — the budget is never reclaimed — so further packages are
 * no longer acquired and their imports report a spurious "cannot find module"
 * until the tab is reopened. Surfaced (rather than only `console.warn`'d) so the
 * editor can show a user-facing degradation notice (HarperFast/studio#1504).
 */
export function isTypeAcquisitionBudgetSpent(): boolean {
	return extraLibBudget.isSpent;
}

/**
 * Acquire npm `@types` for every package imported across the given source files.
 * Best-effort and idempotent; safe to call on each project load.
 */
export async function acquireApplicationTypes(sources: string[]): Promise<void> {
	if (sources.length === 0) {
		return;
	}
	// Once the aggregate budget is spent it is never reclaimed, so the
	// acquisition engine would walk the CDN and parse declarations only for
	// `receivedFile` to discard every one. Skip the whole pass — including its
	// network requests — rather than pay for work that can't land.
	if (extraLibBudget.isSpent) {
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
