const MODULE_FILE = /\.(?:[cm]?js|[cm]?ts)$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;

export function isHandlerModule(path: string): boolean {
	return MODULE_FILE.test(path) && !DECLARATION_FILE.test(path);
}

export interface ModuleExports {
	/** Value exports a job could name, `default` included. Classes are left out: Harper calls a handler, never `new`s it. */
	names: string[];
	/** `export * from …` re-exports names Studio can't see, so the list may be short. */
	incomplete: boolean;
}

/**
 * The source with comments removed and every string and template literal emptied, so neither commented-out code nor
 * `"export function fake() {}"` in a string offers an export. Regex literals are left as they are.
 */
function codeOnly(source: string): string {
	let code = '';
	let at = 0;
	while (at < source.length) {
		const char = source[at];
		const next = source[at + 1];
		if (char === '/' && next === '/') {
			const end = source.indexOf('\n', at);
			at = end < 0 ? source.length : end;
		} else if (char === '/' && next === '*') {
			const end = source.indexOf('*/', at + 2);
			at = end < 0 ? source.length : end + 2;
			code += ' ';
		} else if (char === '"' || char === "'" || char === '`') {
			let end = at + 1;
			while (end < source.length && source[end] !== char && (char === '`' || source[end] !== '\n')) {
				end += source[end] === '\\' ? 2 : 1;
			}
			code += char + char;
			at = end + 1;
		} else {
			code += char;
			at += 1;
		}
	}
	return code;
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
	for (const match of code.matchAll(/\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
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
