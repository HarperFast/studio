export function mapBy<T, F extends keyof T>(array: T[], fieldName: F): T[F][] {
	const values: T[F][] = [];
	if (array) {
		for (const element of array) {
			values.push(element[fieldName]);
		}
	}
	return values;
}
