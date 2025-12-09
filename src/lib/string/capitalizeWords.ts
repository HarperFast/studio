const capitalizedCache = new Map<string, string>();

export function capitalizeWords(name: string): string {
	if (!name) {
		return '';
	}

	if (capitalizedCache.has(name)) {
		return capitalizedCache.get(name) as string;
	}

	// Normalize separators to single spaces and trim
	const s = name
		.replace(/[-_]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!s) {
		capitalizedCache.set(name, '');
		return '';
	}

	// Split into tokens handling camelCase/PascalCase, acronyms, and numbers
	// Pattern parts:
	// - [A-Z]+(?=[A-Z][a-z]) captures acronym at the start of a PascalCase word (e.g., "APIResponse" -> "API", "Response")
	// - [A-Z]?[a-z]+ captures normal words (camel/pascal or lowercase)
	// - [A-Z]+ captures remaining all-caps (acronyms)
	// - [0-9]+ captures numbers
	const baseTokens = s.match(/([A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+)/g);
	if (!baseTokens) {
		capitalizedCache.set(name, '');
		return '';
	}

	// Merge plural 's' following an acronym (length>=2), e.g., ["ID", "s"] -> ["IDs"]
	const tokens: string[] = [];
	for (let i = 0; i < baseTokens.length; i++) {
		const token = baseTokens[i];
		const next = i + 1 < baseTokens.length ? baseTokens[i + 1] : undefined;
		if (
			// Case 1: full acronym then plural 's' as separate token -> merge
			/^[A-Z]{2,}$/.test(token)
			&& next
			&& /[A-Z]*s$/.test(next)
		) {
			tokens.push(token + next);
			i++; // skip the 's'
		} else if (
			// Case 2: single leading capital followed by capital + 's' (e.g., 'I' + 'Ds') -> merge to 'IDs'
			/^[A-Z]$/.test(token)
			&& next !== undefined
			&& /^[A-Z]s$/.test(next)
		) {
			tokens.push(token + next);
			i++; // skip merged next
		} else {
			tokens.push(token);
		}
	}

	const words = tokens.map(capitalizeTokenWordsAppropriately);

	const result = words.join(' ');
	capitalizedCache.set(name, result);
	return result;
}

function capitalizeTokenWordsAppropriately(t: string): string {
	if (/^[A-Z]{2,3}s?$/.test(t)) {
		// Acronym (e.g., ID, API) possibly with plural 's' -> keep as is
		return t;
	}
	if (/^[0-9]+$/.test(t)) {
		// numbers unchanged
		return t;
	}
	// Normal word: capitalize first letter, lowercase rest
	return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}
