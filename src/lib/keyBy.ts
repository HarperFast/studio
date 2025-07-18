export function keyBy<T extends object>(items: T[], property: keyof T): Record<string, T> {
	const retVal: Record<string, T> = {};

	for (const item of items) {
		const key = item[property] as string;
		if (key === undefined) {
			continue;
		}

		if (Array.isArray(key)) {
			for (const k of key) {
				retVal[k] = item;
			}
		} else {
			retVal[key] = item;
		}
	}

	return retVal;
}
