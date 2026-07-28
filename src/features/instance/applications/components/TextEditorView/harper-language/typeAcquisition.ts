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
const BACKTICK = 0x60, BACKSLASH = 0x5c, DOLLAR = 0x24, DOT = 0x2e;
const OPEN_BRACKET = 0x5b, CLOSE_BRACKET = 0x5d;

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
 * A quoted module specifier at `at`, after optional whitespace. `limit` is the caller's
 * bound and applies to the whitespace run as well as the quotes: without it, a statement
 * whose `from` sits inside the clause bound could still reach a quote arbitrarily far
 * past it, and every keyword candidate would rescan that same run. The specifier body is
 * additionally capped at npm's own name limit, past which it is rejected anyway.
 */
function readQuotedSpecifier(code: string, at: number, bound: number): { specifier: string; end: number } | undefined {
	const opened = skipWhitespace(code, at, bound);
	const quote = code.charCodeAt(opened);
	if (opened >= bound || (quote !== SINGLE_QUOTE && quote !== DOUBLE_QUOTE)) {
		return undefined;
	}
	const limit = Math.min(bound, opened + MAX_SPECIFIER_LENGTH + 2);
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
				const found = readQuotedSpecifier(code, wordEnd, limit);
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

const REFERENCE_PATH = /\/\/\/\s*<reference\s+path\s*=\s*['"]([^'"]+)['"]/g;

/**
 * The specifier belonging to a statement keyword, whichever form follows it: a call
 * `import('…')`/`require('…')`, a bare side-effect `import '…'`, or a clause ending in
 * `from '…'`. Every scan is bounded by `MAX_IMPORT_CLAUSE` from the keyword, so no form
 * can reach across the file and no candidate can rescan a run another already rejected.
 */
function readSpecifierAfterKeyword(
	code: string,
	keyword: string,
	afterKeyword: number,
): { specifier: string; end: number } | undefined {
	const bound = Math.min(code.length, afterKeyword + MAX_IMPORT_CLAUSE);
	if (keyword !== 'export') {
		const parenAt = skipWhitespace(code, afterKeyword, bound);
		if (code.charCodeAt(parenAt) === OPEN_PAREN) {
			const call = readQuotedSpecifier(code, parenAt + 1, bound);
			if (!call) {
				return undefined;
			}
			const closeAt = skipWhitespace(code, call.end, bound);
			return code.charCodeAt(closeAt) === CLOSE_PAREN ? { specifier: call.specifier, end: closeAt + 1 } : undefined;
		}
	}
	if (keyword === 'require') {
		return undefined;
	}
	const bare = keyword === 'import' ? readQuotedSpecifier(code, afterKeyword, bound) : undefined;
	return bare ?? readClauseSpecifier(code, afterKeyword);
}

/** Past the closing quote of a string literal, or `limit` if it never closes. */
function skipStringLiteral(code: string, at: number, limit: number): number {
	const quote = code.charCodeAt(at);
	for (let next = at + 1; next < limit; next++) {
		const charCode = code.charCodeAt(next);
		if (charCode === BACKSLASH) {
			next++;
		} else if (charCode === quote) {
			return next + 1;
		} else if (charCode === NEWLINE) {
			// An unescaped newline means this quote never opened a string (mid-edit, or an
			// apostrophe in prose). Give up the single character so scanning resynchronises.
			return at + 1;
		}
	}
	return limit;
}

/**
 * Past the closing `/` of a regex literal, or `at + 1` if this `/` turns out not to
 * start one — a regex cannot span a line, so hitting a newline first is proof.
 */
function skipRegexLiteral(code: string, at: number, limit: number): number {
	let inCharacterClass = false;
	for (let next = at + 1; next < limit; next++) {
		const charCode = code.charCodeAt(next);
		if (charCode === BACKSLASH) {
			next++;
		} else if (charCode === NEWLINE) {
			return at + 1;
		} else if (charCode === OPEN_BRACKET) {
			inCharacterClass = true;
		} else if (charCode === CLOSE_BRACKET) {
			inCharacterClass = false;
		} else if (charCode === SLASH && !inCharacterClass) {
			return next + 1;
		}
	}
	return at + 1;
}

/**
 * Whether a `/` here opens a regex literal rather than being division. Decided from the
 * previous significant token, the standard heuristic: division follows a value —
 * an identifier, a literal, `)`, or `]` — and a regex follows anything else.
 * `previousWord` covers the keywords that produce no value and so may be followed by a
 * regex (`return /x/`), which a bare "previous char is a letter" test gets wrong.
 *
 * Ambiguity is resolved toward *regex*, `}` included: mistaking division for a regex
 * skips to the next `/` and can only lose an import, while mistaking a regex for
 * division scans its body as code and could take a specifier out of it.
 */
const REGEX_MAY_FOLLOW = new Set([
	'return',
	'typeof',
	'instanceof',
	'case',
	'in',
	'of',
	'delete',
	'void',
	'new',
	'do',
	'else',
	'yield',
	'await',
]);
function canStartRegex(previousChar: number, previousWord: string): boolean {
	if (isIdentifierChar(previousChar)) {
		return REGEX_MAY_FOLLOW.has(previousWord);
	}
	return previousChar !== CLOSE_PAREN && previousChar !== CLOSE_BRACKET
		&& previousChar !== SINGLE_QUOTE && previousChar !== DOUBLE_QUOTE && previousChar !== BACKTICK;
}

/**
 * Every module specifier in `code`, in source order: `import`/`export … from '…'`,
 * dynamic `import('…')`, `require('…')`, and a bare side-effect `import '…'`.
 *
 * The walk tracks lexical context so a keyword is only honoured where real code can
 * appear. That is the root fix for what the RUM review found rather than a mitigation of
 * it: searching the raw text for keywords meant ordinary English in a comment —
 * `// we import rows from "customers"` — parsed as an import and sent a user's table name
 * to jsDelivr. `customers` is a perfectly legal npm name, so no amount of specifier
 * validation downstream can catch it; the only fix is not to read comments as code. The
 * same applies to SQL and GraphQL in template literals, quoted strings, and regex bodies.
 *
 * `@typescript/ata` calls this synchronously on files the user is actively editing, so
 * this is deliberately not a parser and never throws: a real module lexer rejects
 * half-typed code, which for an editor is the normal state, and returning nothing there
 * would silently stop type acquisition mid-keystroke. Where the walk cannot be certain it
 * prefers to treat text as *not* code, which loses an acquisition rather than leaking a
 * name. Template substitutions are still scanned, since `import()` inside one is real
 * code.
 */
function scanSpecifiers(code: string): ScannedSpecifier[] {
	const found: ScannedSpecifier[] = [];
	// Each entry is a `${` substitution we are inside; its value is the brace depth within
	// it, so the matching `}` returns us to the enclosing template. An explicit stack
	// rather than recursion, so deeply nested templates cost memory, never the call stack.
	const substitutions: number[] = [];
	let inTemplate = false;
	let previousChar = 0;
	let previousWord = '';
	let at = 0;
	while (at < code.length) {
		const charCode = code.charCodeAt(at);

		if (inTemplate) {
			if (charCode === BACKSLASH) {
				at += 2;
			} else if (charCode === BACKTICK) {
				inTemplate = false;
				previousChar = BACKTICK;
				at++;
			} else if (charCode === DOLLAR && code.charCodeAt(at + 1) === OPEN_BRACE) {
				substitutions.push(0);
				inTemplate = false;
				previousChar = OPEN_BRACE;
				at += 2;
			} else {
				at++;
			}
			continue;
		}

		if (charCode === SLASH) {
			const following = code.charCodeAt(at + 1);
			if (following === SLASH) {
				const lineEnd = code.indexOf('\n', at + 2);
				at = lineEnd < 0 ? code.length : lineEnd + 1;
				continue;
			}
			if (following === STAR) {
				const commentEnd = code.indexOf('*/', at + 2);
				at = commentEnd < 0 ? code.length : commentEnd + 2;
				continue;
			}
			at = canStartRegex(previousChar, previousWord) ? skipRegexLiteral(code, at, code.length) : at + 1;
			previousChar = SLASH;
			previousWord = '';
			continue;
		}

		if (charCode === SINGLE_QUOTE || charCode === DOUBLE_QUOTE) {
			at = skipStringLiteral(code, at, code.length);
			previousChar = charCode;
			previousWord = '';
			continue;
		}

		if (charCode === BACKTICK) {
			inTemplate = true;
			at++;
			continue;
		}

		if (substitutions.length > 0) {
			if (charCode === OPEN_BRACE) {
				substitutions[substitutions.length - 1]++;
			} else if (charCode === CLOSE_BRACE) {
				if (substitutions[substitutions.length - 1] === 0) {
					substitutions.pop();
					inTemplate = true;
					previousChar = CLOSE_BRACE;
					at++;
					continue;
				}
				substitutions[substitutions.length - 1]--;
			}
		}

		if (isIdentifierChar(charCode)) {
			let wordEnd = at + 1;
			while (wordEnd < code.length && isIdentifierChar(code.charCodeAt(wordEnd))) {
				wordEnd++;
			}
			const word = code.slice(at, wordEnd);
			// `obj.import` and `{ import: x }` are property names, not statements.
			const isStatementKeyword = previousChar !== DOT
				&& (word === 'import' || word === 'export' || word === 'require');
			const scanned = isStatementKeyword ? readSpecifierAfterKeyword(code, word, wordEnd) : undefined;
			if (scanned) {
				found.push({ specifier: scanned.specifier, pos: at, end: scanned.end });
				previousChar = code.charCodeAt(scanned.end - 1);
				previousWord = '';
				at = scanned.end;
				continue;
			}
			previousChar = code.charCodeAt(wordEnd - 1);
			previousWord = word;
			at = wordEnd;
			continue;
		}

		if (!isWhitespace(charCode)) {
			previousChar = charCode;
			previousWord = '';
		}
		at++;
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
