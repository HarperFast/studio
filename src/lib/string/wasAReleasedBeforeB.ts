/**
 * Compare two semver strings according to SemVer 2.0.0 rules.
 * Returns true if "b" (second argument) is greater than or equal to "a" (first argument).
 * @param a The base version
 * @param b The potentially greater version
 * @example compareSemVer('4.7.0-beta.7', '4.7.0') => true
 * @example compareSemVer('4.7.0', '4.7.0-beta.7') => false
 */
export function wasAReleasedBeforeB(a: string, b: string): boolean {
	const pa = parseSemVer(a);
	const pb = parseSemVer(b);

	if (!pa || !pb) return false;

	return semverCompare(pb, pa) >= 0; // is b >= a ?
}

// Internal representation of a semver
interface SemVerParts {
	major: number;
	minor: number;
	patch: number;
	pre: (number | string)[]; // numeric identifiers stay numbers, others as strings
}

function parseSemVer(input: string): SemVerParts | null {
	if (typeof input !== 'string') {
		return null;
	}

	// Strip build metadata (+...) as it has no effect on precedence
	const [versionAndPre] = input.split('+', 1).concat('');

	// Separate core and pre-release
	const firstDash = versionAndPre.indexOf('-');
	const core = firstDash === -1 ? versionAndPre : versionAndPre.slice(0, firstDash);
	const pre = firstDash === -1 ? '' : versionAndPre.slice(firstDash + 1);

	const coreParts = core.split('.');
	if (coreParts.length === 0) return null;

	const major = toInt(coreParts[0]);
	const minor = toInt(coreParts[1] ?? '0');
	const patch = toInt(coreParts[2] ?? '0');

	if (major == null || minor == null || patch == null) return null;

	const preParts: (number | string)[] = pre
		? pre.split('.').map((id) => (isNumeric(id) ? Number(id) : id))
		: [];

	return { major, minor, patch, pre: preParts };
}

function toInt(s?: string): number | null {
	if (s == null || s === '') return null;
	if (!/^\d+$/.test(s)) return null;
	return Number(s);
}

function isNumeric(s: string): boolean {
	return /^\d+$/.test(s);
}

// Returns -1 if a<b, 0 if a==b, 1 if a>b
function semverCompare(a: SemVerParts, b: SemVerParts): number {
	if (a.major !== b.major) return a.major < b.major ? -1 : 1;
	if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
	if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;

	const aHasPre = a.pre.length > 0;
	const bHasPre = b.pre.length > 0;
	if (!aHasPre && !bHasPre) return 0;
	// A version without pre-release is greater than one with pre-release
	if (!aHasPre && bHasPre) return 1;
	if (aHasPre && !bHasPre) return -1;

	const len = Math.min(a.pre.length, b.pre.length);
	for (let i = 0; i < len; i++) {
		const idA = a.pre[i];
		const idB = b.pre[i];
		const aNum = typeof idA === 'number';
		const bNum = typeof idB === 'number';

		if (aNum && bNum) {
			if (idA !== (idB as number)) return (idA as number) < (idB as number) ? -1 : 1;
			continue;
		}
		if (aNum && !bNum) return -1; // numeric identifiers have lower precedence than non-numeric
		if (!aNum && bNum) return 1;

		// both strings: ASCII lexicographic compare
		if (idA !== idB) return String(idA) < String(idB) ? -1 : 1;
	}

	// If all identifiers equal so far, longer set has higher precedence
	if (a.pre.length !== b.pre.length) return a.pre.length < b.pre.length ? -1 : 1;

	return 0;
}
