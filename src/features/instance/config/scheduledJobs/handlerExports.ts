const MODULE_FILE = /\.(?:[cm]?js|[cm]?ts)$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;

/** A `#` can't be in a handler's file: Harper splits the handler on its first `#`, so the rest reads as the export. */
export function isHandlerModule(path: string): boolean {
	return MODULE_FILE.test(path) && !DECLARATION_FILE.test(path) && !path.includes('#');
}

interface ModuleExports {
	/** Value exports a job could name, `default` included. Classes are left out: Harper calls a handler, never `new`s it. */
	names: string[];
	/** `export * from …` re-exports names Studio can't see, so the list may be short. */
	incomplete: boolean;
}

/** After one of these, a `/` starts a regex literal rather than dividing. */
const BEFORE_REGEX = new Set([
	'',
	'(',
	',',
	'=',
	':',
	'[',
	'!',
	'&',
	'|',
	'?',
	'{',
	'}',
	';',
	'+',
	'-',
	'*',
	'%',
	'<',
	'>',
	'~',
	'^',
]);
const KEYWORDS_BEFORE_REGEX = new Set([
	'return',
	'typeof',
	'instanceof',
	'in',
	'of',
	'new',
	'delete',
	'void',
	'throw',
	'case',
	'do',
	'else',
	'yield',
	'await',
]);

function skipString(source: string, at: number): number {
	const quote = source[at];
	let end = at + 1;
	while (end < source.length && source[end] !== quote && source[end] !== '\n') {
		end += source[end] === '\\' ? 2 : 1;
	}
	return end + 1;
}

function skipRegex(source: string, at: number): number {
	let end = at + 1;
	let inClass = false;
	while (end < source.length && source[end] !== '\n') {
		const char = source[end];
		if (char === '\\') {
			end += 2;
			continue;
		}
		if (char === '[') {
			inClass = true;
		} else if (char === ']') {
			inClass = false;
		} else if (char === '/' && !inClass) {
			break;
		}
		end += 1;
	}
	end += 1;
	while (end < source.length && /[a-z]/i.test(source[end])) {
		end += 1;
	}
	return end;
}

function skipTemplate(source: string, at: number): number {
	let end = at + 1;
	while (end < source.length && source[end] !== '`') {
		if (source[end] === '\\') {
			end += 2;
		} else if (source[end] === '$' && source[end + 1] === '{') {
			end = scan(source, end + 2, true).end;
		} else {
			end += 1;
		}
	}
	return end + 1;
}

function scan(source: string, start: number, untilBrace: boolean): { code: string; end: number } {
	let code = '';
	let depth = 0;
	let at = start;
	// The last non-space character and the word it ends, which decide whether a `/` starts a regex.
	let last = '';
	let word = '';
	const value = (placeholder: string) => {
		code += placeholder;
		last = '0';
		word = '';
	};
	while (at < source.length) {
		const char = source[at];
		const next = source[at + 1];
		if (untilBrace && char === '}' && depth === 0) {
			return { code, end: at + 1 };
		}
		if (char === '/' && next === '/') {
			const lineEnd = source.indexOf('\n', at);
			at = lineEnd < 0 ? source.length : lineEnd;
		} else if (char === '/' && next === '*') {
			const commentEnd = source.indexOf('*/', at + 2);
			at = commentEnd < 0 ? source.length : commentEnd + 2;
			code += ' ';
		} else if (char === '"' || char === "'") {
			at = skipString(source, at);
			value(char + char);
		} else if (char === '`') {
			at = skipTemplate(source, at);
			value('``');
		} else if (char === '/' && (BEFORE_REGEX.has(last) || KEYWORDS_BEFORE_REGEX.has(word))) {
			at = skipRegex(source, at);
			value('/./');
		} else {
			depth += char === '{' ? 1 : char === '}' ? -1 : 0;
			code += char;
			at += 1;
			if (!/\s/.test(char)) {
				word = /[\w$]/.test(char) ? (/[\w$]/.test(last) && source[at - 2] === last ? word : '') + char : '';
				last = char;
			}
		}
	}
	return { code, end: at };
}

/** Literals are emptied so that `"export function fake() {}"` in a string offers nothing. Without a parser a regex after `)` reads as division. */
function codeOnly(source: string): string {
	return scan(source, 0, false).code;
}

/**
 * The exports a module declares, read from its text rather than run, so it's a guide: `export *` and generated exports
 * are invisible to it.
 */
export function readModuleExports(source: string): ModuleExports {
	const code = codeOnly(source);
	const names = new Set<string>();
	if (/\bexport\s+default\b/.test(code)) {
		names.add('default');
	}
	for (const match of code.matchAll(/\bexport\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g)) {
		names.add(match[1]);
	}
	// Only a binding that is plainly a function: Harper refuses a handler that isn't one, and the rest can be typed.
	const functionBinding =
		/\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g;
	for (const match of code.matchAll(functionBinding)) {
		names.add(match[1]);
	}
	for (const match of code.matchAll(/\bexport\s+(type\s+)?\{([^}]*)\}/g)) {
		if (match[1]) {
			continue;
		}
		for (const specifier of match[2].split(',')) {
			const parts = specifier.trim().split(/\s+/);
			if (parts.length === 0 || parts[0] === '' || parts[0] === 'type') {
				continue;
			}
			names.add(parts.length >= 3 && parts[1] === 'as' ? parts[2] : parts[0]);
		}
	}
	return { names: [...names].sort(sortDefaultFirst), incomplete: /\bexport\s*\*/.test(code) };
}

function sortDefaultFirst(a: string, b: string): number {
	if (a === 'default') {
		return -1;
	}
	if (b === 'default') {
		return 1;
	}
	return a.localeCompare(b);
}
