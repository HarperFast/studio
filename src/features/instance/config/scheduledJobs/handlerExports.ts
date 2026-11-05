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
 * The exports a module declares, read from its text rather than run, so it's a guide: `export *` and generated exports
 * are invisible to it. Comments are stripped first so commented-out code doesn't offer an export.
 */
export function readModuleExports(source: string): ModuleExports {
	const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
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
