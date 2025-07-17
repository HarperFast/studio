export function groupBy<T extends object>(items: T[], property: keyof T): Record<string, T[]> {
	const retVal: Record<string, T[]> = {};

	for (const item of items) {
		const key = item[property] as string;
		if (key === undefined) {
			continue;
		}

		if (Array.isArray(key)) {
			for (const k of key) {
				if (!retVal[k]) {
					retVal[k] = [];
				}
				retVal[k].push(item);
			}
		} else {
			if (!retVal[key]) {
				retVal[key] = [];
			}
			retVal[key].push(item);
		}
	}

	return retVal as Record<string, T[]>;
}
