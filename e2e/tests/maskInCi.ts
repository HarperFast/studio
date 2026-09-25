/**
 * Asks GitHub Actions to mask a value the run generated, in every later log line, annotation and
 * job summary. Configured secrets are masked already; a verification token or a password made up by
 * a spec is not, and this repository's Actions logs are public. It relies on the `list` reporter
 * printing test stdout at the start of a line, which is where the runner reads commands.
 */
export function maskInCi(value: string | undefined): void {
	if (process.env.GITHUB_ACTIONS && value) { console.log(`::add-mask::${value}`); }
}
