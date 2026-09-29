/**
 * GitHub masks configured secrets, not values a spec makes up, and this repository's Actions logs are
 * public. Relies on the `list` reporter printing test stdout at the start of a line, where the
 * runner reads `::add-mask::`.
 */
export function maskInCi(value: string | undefined): void {
	if (!process.env.GITHUB_ACTIONS || !value) { return; }
	for (const form of new Set([value, encodeURIComponent(value)])) { console.log(`::add-mask::${form}`); }
}
