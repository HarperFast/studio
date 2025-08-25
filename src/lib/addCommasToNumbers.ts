export function addCommasToNumbers(input: number): string {
	return new Intl.NumberFormat().format(input);
}
