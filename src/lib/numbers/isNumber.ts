export function isNumber(str: string): boolean {
	return !isNaN(str as unknown as number)
		&& !isNaN(parseFloat(str));
}
