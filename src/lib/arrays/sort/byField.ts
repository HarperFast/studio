export function sortByField<T>(fieldName: keyof T): (a: T, b: T) => number {
	return (a: T, b: T): number => {
		if (a[fieldName] === b[fieldName]) {
			return 0;
		}
		return a[fieldName] > b[fieldName] ? 1 : -1;
	};
}
