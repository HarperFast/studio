export function isPositive(value: number | undefined): value is number {
	return value !== undefined && value > 0;
}
