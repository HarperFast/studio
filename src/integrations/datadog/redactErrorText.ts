/**
 * Strip customer-identifying git repository references — and any credentials embedded in a
 * URL — out of error text before it leaves the browser for Datadog.
 *
 * Deploy failures quote the `package` reference the customer entered, so a message like
 * "Failed to deploy git@github.com:acme-corp/billing-service.git: …" carries their private
 * repo's owner and name (and, for an https remote, sometimes a token in the userinfo) into
 * Error Tracking, where it is retained and searchable. The repo identity tells us nothing we
 * can debug with — the host does — so keep the host and drop the path.
 *
 * Applied by `beforeSend` to `error.message` and `error.stack` of every event we keep. Studio's
 * own asset URLs and Harper API endpoints are deliberately left intact: stack frames and
 * `.../HDBInstance/<id>/operation` paths are how these errors get triaged.
 */

const REDACTED = '<redacted>';

/**
 * Hosts whose URL path *is* a repository identity. Self-hosted forges are matched by the
 * `git.`/`gitlab.`/`github.` hostname prefix convention instead of being enumerated.
 */
const GIT_HOSTS = new Set([
	'github.com',
	'gitlab.com',
	'bitbucket.org',
	'dev.azure.com',
	'ssh.dev.azure.com',
	'codeberg.org',
	'git.sr.ht',
	'gitea.com',
]);

/** URL-shaped tokens (`scheme://…`), ending at whitespace or enclosing punctuation. */
const URL_TOKEN = /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s'"<>)\]]+/g;

/** Sentence punctuation the token regex swallows when a URL ends a clause. */
const TRAILING_PUNCTUATION = /[.,:;!?]+$/;

/**
 * scp-style git remotes: `git@github.com:acme-corp/repo.git`. Requires both userinfo and a
 * `<segment>/<segment>` path, so ordinary "Title: detail" text and stack frames
 * (`index-A1b2C3d4.js:5:1234`) can't match.
 */
const SCP_GIT_REMOTE = /([\w.+-]+@[\w.-]+):[\w.-]+\/[\w./-]+/g;

function isRepositoryUrl(url: URL) {
	return url.protocol === 'git:'
		|| url.protocol === 'ssh:'
		|| /\.git\/?$/.test(url.pathname)
		|| GIT_HOSTS.has(url.hostname)
		|| /^(?:git|gitlab|github)[.-]/.test(url.hostname);
}

function redactUrl(token: string) {
	const trailing = TRAILING_PUNCTUATION.exec(token)?.[0] ?? '';
	const bare = trailing ? token.slice(0, -trailing.length) : token;
	let url: URL;
	try {
		url = new URL(bare);
	} catch {
		return token;
	}
	if (isRepositoryUrl(url)) {
		// Rebuild by hand rather than via `toString()`: this drops userinfo, query, and fragment
		// (a `?ref=`/`#branch` can name a private branch) without normalizing the rest.
		return `${url.protocol}//${url.host}/${REDACTED}${trailing}`;
	}
	if (url.username || url.password) {
		url.username = '';
		url.password = '';
		return `${url.toString()}${trailing}`;
	}
	return token;
}

/** Redact repository references and URL credentials in `text`. Returns it unchanged if none. */
export function redactErrorText(text: string) {
	return text
		.replace(URL_TOKEN, redactUrl)
		.replace(SCP_GIT_REMOTE, `$1:${REDACTED}`);
}
