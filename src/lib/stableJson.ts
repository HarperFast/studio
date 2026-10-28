export function stableJson(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableJson).join(',')}]`;
	}
	if (value !== null && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return `{${
			Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')
		}}`;
	}
	return JSON.stringify(value) ?? 'null';
}
