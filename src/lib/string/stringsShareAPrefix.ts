export function stringsShareAPrefix(haystacks: string[], needle: string, delimiter = '-'): boolean {
	const prefix = needle.split(delimiter)[0];
	return -1 !== haystacks.findIndex(haystack => haystack.startsWith(prefix));
}
