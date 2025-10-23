export function joinPath(...parts: (string | string[])[]): string {
	return parts.flat(1).join('/');
}
