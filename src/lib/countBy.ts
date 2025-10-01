export function countBy<T extends object>(items: T[], property: keyof T): Record<string, number> {
	const retVal: Record<string, number> = {};

	for (const item of items) {
		const key = item[property] as string;
		if (key === undefined) {
			continue;
		}

		if (Array.isArray(key)) {
			for (const k of key) {
				if (!retVal[k]) {
					retVal[k] = 0;
				}
				retVal[k] += 1;
			}
		} else {
			if (!retVal[key]) {
				retVal[key] = 0;
			}
			retVal[key] += 1;
		}
	}

	return retVal;
}
