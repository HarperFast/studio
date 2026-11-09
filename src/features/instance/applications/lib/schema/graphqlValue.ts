/**
 * GraphQL input-value literals as plain data. Directive arguments are stored as their verbatim literal
 * text (see `DirectiveArg.value`) so values the editor doesn't understand round-trip untouched; this is
 * for the few arguments whose structure the editor does edit — `@fullText`'s list of source objects,
 * its synonym rules and its highlighting object.
 *
 * Only what those arguments can hold is read: strings, numbers, booleans, `null`, lists and objects.
 * Enum values, variables and block strings make {@link parseGraphqlValue} return `undefined`, which
 * callers treat as "show it read-only" rather than guessing.
 */

export type GraphqlValue = string | number | boolean | null | GraphqlValue[] | { [key: string]: GraphqlValue };

// Sticky, so each match starts at the read position without copying the rest of the input.
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const NAME = /[_A-Za-z][_0-9A-Za-z]*/y;
const INVALID = Symbol('invalid');
// Far deeper than any directive argument; past it the text is refused rather than recursed into.
const MAX_DEPTH = 64;

class Reader {
	private index = 0;
	private depth = 0;
	private readonly src: string;

	constructor(src: string) {
		this.src = src;
	}

	/** GraphQL treats commas as whitespace, and `#` starts a comment that runs to the end of the line. */
	skipIgnored(): void {
		while (this.index < this.src.length) {
			const char = this.src[this.index];
			if (char === '#') {
				while (this.index < this.src.length && this.src[this.index] !== '\n' && this.src[this.index] !== '\r') {
					this.index++;
				}
			} else if (/[\s,﻿]/.test(char)) {
				this.index++;
			} else {
				return;
			}
		}
	}

	/** The text `pattern` (a sticky regex) matches at the read position, without advancing past it. */
	private match(pattern: RegExp): string | undefined {
		pattern.lastIndex = this.index;
		return pattern.exec(this.src)?.[0];
	}

	atEnd(): boolean {
		this.skipIgnored();
		return this.index >= this.src.length;
	}

	value(): GraphqlValue | typeof INVALID {
		this.skipIgnored();
		const char = this.src[this.index];
		if (char === '"') {
			return this.string();
		}
		if (char === '[' || char === '{') {
			if (this.depth >= MAX_DEPTH) {
				return INVALID;
			}
			this.depth++;
			const nested = char === '[' ? this.list() : this.object();
			this.depth--;
			return nested;
		}
		const number = this.match(NUMBER);
		if (number) {
			// `1x` is no number at all; GraphQL forbids a name character straight after one.
			const after = this.src[this.index + number.length];
			if (after !== undefined && /[_A-Za-z0-9.]/.test(after)) {
				return INVALID;
			}
			this.index += number.length;
			return Number(number);
		}
		const name = this.match(NAME);
		if (name === 'true' || name === 'false' || name === 'null') {
			this.index += name.length;
			return name === 'null' ? null : name === 'true';
		}
		return INVALID;
	}

	private string(): string | typeof INVALID {
		if (this.src.startsWith('"""', this.index)) {
			return INVALID;
		}
		let end = this.index + 1;
		while (end < this.src.length && this.src[end] !== '"') {
			if (this.src[end] === '\n' || this.src[end] === '\r') {
				return INVALID;
			}
			end += this.src[end] === '\\' ? 2 : 1;
		}
		if (end >= this.src.length) {
			return INVALID;
		}
		try {
			// GraphQL string escapes are JSON's (`\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`, `\uXXXX`).
			const text = JSON.parse(this.src.slice(this.index, end + 1)) as string;
			this.index = end + 1;
			return text;
		} catch {
			return INVALID;
		}
	}

	private list(): GraphqlValue[] | typeof INVALID {
		this.index++;
		const items: GraphqlValue[] = [];
		for (;;) {
			this.skipIgnored();
			if (this.index >= this.src.length) {
				return INVALID;
			}
			if (this.src[this.index] === ']') {
				this.index++;
				return items;
			}
			const item = this.value();
			if (item === INVALID) {
				return INVALID;
			}
			items.push(item);
		}
	}

	private object(): { [key: string]: GraphqlValue } | typeof INVALID {
		this.index++;
		// No prototype, so a key named `__proto__` or `constructor` is just a key.
		const fields: { [key: string]: GraphqlValue } = Object.create(null);
		for (;;) {
			this.skipIgnored();
			if (this.index >= this.src.length) {
				return INVALID;
			}
			if (this.src[this.index] === '}') {
				this.index++;
				return fields;
			}
			const name = this.match(NAME);
			if (!name || Object.hasOwn(fields, name)) {
				return INVALID;
			}
			this.index += name.length;
			this.skipIgnored();
			if (this.src[this.index] !== ':') {
				return INVALID;
			}
			this.index++;
			const value = this.value();
			if (value === INVALID) {
				return INVALID;
			}
			fields[name] = value;
		}
	}
}

/**
 * Read a GraphQL value literal (`[{ name: "title", weight: 3 }]`) as plain data. `undefined` when the
 * text holds anything else, or anything after the value.
 */
export function parseGraphqlValue(literal: string): { value: GraphqlValue } | undefined {
	const reader = new Reader(literal);
	const value = reader.value();
	if (value === INVALID || !reader.atEnd()) {
		return undefined;
	}
	return { value };
}

/** Print plain data as a GraphQL value literal, objects in their key order: `{ name: "title", weight: 3 }`. */
export function printGraphqlValue(value: GraphqlValue): string {
	if (value === null) {
		return 'null';
	}
	if (Array.isArray(value)) {
		return `[${value.map(printGraphqlValue).join(', ')}]`;
	}
	switch (typeof value) {
		case 'string':
			return JSON.stringify(value);
		case 'number':
			if (!Number.isFinite(value)) {
				throw new RangeError(`GraphQL has no literal for ${value}`);
			}
			return String(value);
		case 'boolean':
			return value ? 'true' : 'false';
		default: {
			const entries = Object.entries(value);
			return entries.length === 0
				? '{}'
				: `{ ${entries.map(([key, entry]) => `${key}: ${printGraphqlValue(entry)}`).join(', ')} }`;
		}
	}
}

export function isGraphqlObject(value: GraphqlValue | undefined): value is { [key: string]: GraphqlValue } {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
