export function curryFilterByFuzzySearch<T>(fields: (keyof T)[], searchFor: string): (t: T) => boolean {
	const searchForLower = searchFor.toLowerCase();
	return (t: T) => {
		for (const field of fields) {
			const value = t[field];
			if (value === undefined || value === null) {
				continue;
			}
			if (typeof value === 'string') {
				if (value.toLowerCase().includes(searchForLower)) {
					return true;
				}
			} else if (typeof value === 'boolean') {
				if (value && (searchForLower === 'yes' || searchForLower === 'true' || searchForLower === '1')) {
					return true;
				}
				if (!value && (searchForLower === 'no' || searchForLower === 'false' || searchForLower === '0')) {
					return true;
				}
			} else {
				throw new Error('curryFilterByFuzzySearch has not implemented support for ' + (typeof value) + ' fields yet!');
			}
		}
		return false;
	};
}
