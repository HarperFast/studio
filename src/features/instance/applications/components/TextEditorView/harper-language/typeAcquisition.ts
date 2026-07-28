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
 * How many characters of one import clause the scanner reads before abandoning the
 * statement — the whole clause, comments included. Real clauses are nowhere close:
 * the longest in this repo is 351 chars, and across ~13k declaration files in
 * `node_modules` the longest is a 1.6 KB barrel re-export, so 4 KB leaves ample
 * headroom. A clause past the bound just isn't acquired, the same degraded-but-safe
 * outcome as any unacquired package.
 *
 * The bound is load-bearing, and it has to bound *characters*. `acquireApplicationTypes`
 * scans every project script joined together and ata re-scans every downloaded
 * `.d.ts`, so a clause that can never resolve has to cost the same whether the file
 * is 4 KB or 6 MB. An unterminated `/*` — a mid-edit save, a truncated CDN response —
 * has no terminator to find, and hunting for one to end-of-input, once per
 * `import`/`export` occurrence, is quadratic: 719 KB of that took ~22s on the main
 * thread. Bounded, it scans in ~200ms, and real files in ~1ms.
 *
 * A ceiling on `code.length` instead would not have fixed it: 281 KB of clause-legal
 * characters is under any sane ceiling and still took ~2.5s, and a ceiling would drop
 * acquisition entirely for large but perfectly ordinary projects.
 */
const MAX_IMPORT_CLAUSE = 4096;

const SLASH = 0x2f, STAR = 0x2a, NEWLINE = 0x0a, SINGLE_QUOTE = 0x27, DOUBLE_QUOTE = 0x22;
const OPEN_PAREN = 0x28, CLOSE_PAREN = 0x29, OPEN_BRACE = 0x7b, CLOSE_BRACE = 0x7d, COMMA = 0x2c;

/** `\w` plus `$` — what a clause keyword or imported binding is spelled with. */
function isIdentifierChar(charCode: number): boolean {
	return (charCode >= 0x61 && charCode <= 0x7a) // a-z
		|| (charCode >= 0x41 && charCode <= 0x5a) // A-Z
		|| (charCode >= 0x30 && charCode <= 0x39) // 0-9
		|| charCode === 0x5f // _
		|| charCode === 0x24; // $
}

/** Everything `\s` matches, so multi-line and oddly-spaced imports behave as before. */
function isWhitespace(charCode: number): boolean {
	return charCode === 0x20
		|| (charCode >= 0x09 && charCode <= 0x0d)
		|| charCode === 0xa0
		|| charCode === 0xfeff
		|| (charCode >= 0x2000 && charCode <= 0x200a)
		|| charCode === 0x2028
		|| charCode === 0x2029
		|| charCode === 0x3000;
}

function skipWhitespace(code: string, at: number, limit: number): number {
	let next = at;
	while (next < limit && isWhitespace(code.charCodeAt(next))) {
		next++;
	}
	return next;
}

/** `indexOf`, but it never looks past `limit` — an unbounded terminator search is what went quadratic. */
function indexOfWithin(code: string, charCode: number, at: number, limit: number): number {
	for (let next = at; next < limit; next++) {
		if (code.charCodeAt(next) === charCode) {
			return next;
		}
	}
	return -1;
}

function indexOfPairWithin(code: string, first: number, second: number, at: number, limit: number): number {
	for (let next = at; next + 1 < limit; next++) {
		if (code.charCodeAt(next) === first && code.charCodeAt(next + 1) === second) {
			return next;
		}
	}
	return -1;
}

/** A specifier the scanner found, plus the span ata's `preProcessFile` reports for it. */
interface ScannedSpecifier {
	specifier: string;
	pos: number;
	end: number;
}

/**
 * A quoted module specifier at `at`, after optional whitespace. Bounded by npm's own
 * name limit: past that the specifier is rejected anyway, so reading further would
 * only turn a missing closing quote into another unbounded scan.
 */
function readQuotedSpecifier(code: string, at: number): { specifier: string; end: number } | undefined {
	const opened = skipWhitespace(code, at, code.length);
	const quote = code.charCodeAt(opened);
	if (quote !== SINGLE_QUOTE && quote !== DOUBLE_QUOTE) {
		return undefined;
	}
	const limit = Math.min(code.length, opened + MAX_SPECIFIER_LENGTH + 2);
	for (let next = opened + 1; next < limit; next++) {
		const charCode = code.charCodeAt(next);
		if (charCode === quote) {
			// `['"]([^'"]+)['"]` never matched an empty specifier, and neither do we.
			return next === opened + 1 ? undefined : { specifier: code.slice(opened + 1, next), end: next + 1 };
		}
		if (charCode === SINGLE_QUOTE || charCode === DOUBLE_QUOTE) {
			return undefined;
		}
	}
	return undefined;
}

/**
 * Walks the clause between an `import`/`export` keyword and its `from`, returning the
 * quoted specifier when the statement really is an import.
 *
 * A character walk rather than another regex alternative, deliberately. This has to
 * stay cheap on input that can never match, and expressing the clause as a quantified
 * sub-pattern gave us both failure modes in turn: an unbounded search for a comment
 * terminator is quadratic, and bounding it with `{0,n}` instead accumulates V8
 * backtracking frames until a long run of large *legal* comments overflows the regex
 * stack with a `RangeError`. Walking has no frames to accumulate, and every
 * terminator search here is bounded by `MAX_IMPORT_CLAUSE`.
 *
 * What may appear in a clause is narrow, and the narrowness is the security property
 * rather than tidiness: identifiers, `{}`, `,`, `*`, whitespace, and comments. A bare
 * `/`, `=`, `:`, `(`, `)`, or backtick ends the clause, which is what stops the walk
 * from leaving a statement and reaching a `from "…"` in a neighbouring comment, SQL
 * string, or GraphQL block — the leak that sent `Known Fraudster Risk` to jsDelivr as
 * a package name. Comments are skipped whole for the same reason: never partially, so
 * a `from "…"` inside one can't be read as the statement's own.
 */
function readClauseSpecifier(code: string, clauseStart: number): { specifier: string; end: number } | undefined {
	const limit = Math.min(code.length, clauseStart + MAX_IMPORT_CLAUSE);
	let at = clauseStart;
	while (at < limit) {
		const charCode = code.charCodeAt(at);
		if (charCode === SLASH) {
			const following = code.charCodeAt(at + 1);
			if (following === SLASH) {
				// A line comment runs to the newline; with none, the rest of the file is
				// comment, so no `from` can follow and the statement is not an import.
				const lineEnd = indexOfWithin(code, NEWLINE, at + 2, limit);
				if (lineEnd < 0) {
					return undefined;
				}
				at = lineEnd + 1;
			} else if (following === STAR) {
				const commentEnd = indexOfPairWithin(code, STAR, SLASH, at + 2, limit);
				if (commentEnd < 0) {
					return undefined;
				}
				at = commentEnd + 2;
			} else {
				return undefined;
			}
			continue;
		}
		if (isIdentifierChar(charCode)) {
			let wordEnd = at + 1;
			while (wordEnd < limit && isIdentifierChar(code.charCodeAt(wordEnd))) {
				wordEnd++;
			}
			// A `from` that no specifier follows is just a binding name (`import from from 'x'`).
			if (wordEnd - at === 4 && code.startsWith('from', at)) {
				const found = readQuotedSpecifier(code, wordEnd);
				if (found) {
					return found;
				}
			}
			at = wordEnd;
			continue;
		}
		if (
			charCode === OPEN_BRACE || charCode === CLOSE_BRACE || charCode === COMMA || charCode === STAR
			|| isWhitespace(charCode)
		) {
			at++;
			continue;
		}
		return undefined;
	}
	return undefined;
}

/** Keywords that can introduce a specifier — the only places the scanner starts work. */
const STATEMENT_KEYWORD = /\b(?:import|export|require)\b/g;
const REFERENCE_PATH = /\/\/\/\s*<reference\s+path\s*=\s*['"]([^'"]+)['"]/g;

/**
 * Every module specifier in `code`, in source order: `import`/`export … from '…'`,
 * dynamic `import('…')`, `require('…')`, and a bare side-effect `import '…'`.
 */
function scanSpecifiers(code: string): ScannedSpecifier[] {
	const found: ScannedSpecifier[] = [];
	for (const match of code.matchAll(STATEMENT_KEYWORD)) {
		const keyword = match[0];
		const pos = match.index;
		const afterKeyword = pos + keyword.length;
		if (keyword !== 'export' && code.charCodeAt(skipWhitespace(code, afterKeyword, code.length)) === OPEN_PAREN) {
			const call = readQuotedSpecifier(code, skipWhitespace(code, afterKeyword, code.length) + 1);
			if (call) {
				const closeAt = skipWhitespace(code, call.end, code.length);
				if (code.charCodeAt(closeAt) === CLOSE_PAREN) {
					found.push({ specifier: call.specifier, pos, end: closeAt + 1 });
				}
			}
			continue;
		}
		if (keyword === 'require') {
			continue;
		}
		const bare = keyword === 'import' ? readQuotedSpecifier(code, afterKeyword) : undefined;
		const scanned = bare ?? readClauseSpecifier(code, afterKeyword);
		if (scanned) {
			found.push({ specifier: scanned.specifier, pos, end: scanned.end });
		}
	}
	return found;
}

/**
 * Every acquirable npm specifier the scanner finds in `code`, in source order.
 * Exported for tests: this is the one step that decides which names become
 * requests to jsDelivr, and it reads arbitrary user code without a real parser, so
 * its over-match behaviour is what needs pinning down.
 */
export function findAcquirableSpecifiers(code: string): string[] {
	return scanSpecifiers(code)
		.map(({ specifier }) => specifier)
		.filter(isAcquirablePackage);
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
			const importedFiles = scanSpecifiers(code)
				.filter(({ specifier }) => isAcquirablePackage(specifier))
				.map(({ specifier, pos, end }) => ({ fileName: specifier, pos, end }));
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
