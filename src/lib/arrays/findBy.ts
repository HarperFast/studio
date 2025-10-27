export function findBy<T, F extends keyof T>(array: T[], fieldName: F, value: T[F]): T | undefined {
	for (const element of array) {
		if (element[fieldName] === value) {
			return element;
		}
	}
	return undefined;
}
