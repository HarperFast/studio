export function pluralize(value: number | string, singular: string, plural: string): string {
	if (value === 1 || value === '1') {
		return `${value} ${singular}`;
	}
	return `${value} ${plural}`;
}
