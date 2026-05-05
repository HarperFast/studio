export function joinPath(...parts: (string | string[])[]): string {
	const flattened = parts.flat(1);
	return flattened
		.map((p, i) =>
			typeof p !== 'string'
				? p
				: trimSlashes(p, i !== 0, i !== flattened.length - 1)
		)
		.join('/');
}

function trimSlashes(str: string, start: boolean = true, end: boolean = true) {
	const trimStart = start && str[0] === '/';
	const trimEnd = end && str[str.length - 1] === '/';
	if (trimStart && trimEnd) {
		return str.slice(1, -1);
	}
	if (trimStart) {
		return str.slice(1);
	}
	if (trimEnd) {
		return str.slice(0, -1);
	}
	return str;
}
