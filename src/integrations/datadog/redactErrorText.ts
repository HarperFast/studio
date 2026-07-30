/**
 * Strip customer-identifying URL paths — and any credentials embedded in a URL — out of error
 * text before it leaves the browser for Datadog.
 *
 * Deploy failures quote the `package` reference the customer entered, so a message like
 * "Failed to deploy git@github.com:acme-corp/billing-service.git: …" carries their private
 * repo's owner and name (and, for an https remote, sometimes a token in the userinfo) into
 * Error Tracking, where it is retained and searchable.
 *
 * Deciding which URLs *are* repositories turned out to be the wrong way round: github.com and
 * gitlab.com are the easy half, but a GitLab or Gitea self-hosted at `scm.acme-corp.com` looks
 * like nothing in particular, and neither does the `https://api.github.com/repos/<owner>/<repo>`
 * lookup Studio itself makes while the deploy form is filled in. No list of forges or hostname
 * conventions ever finishes. Harper's own domains, by contrast, are a short list we control — so
 * keep the path only for those, and reduce every other URL to scheme + host + `<redacted>`. The
 * host is what we debug with; the path is where the customer's identity lives.
 *
 * Applied by `beforeSend` to `error.message`, `error.stack`, and `error.resource.url` of every
 * event we keep. Harper API endpoints (`.../HDBInstance/<id>/operation`) and Studio's own asset
 * URLs therefore stay intact: the first is how these errors get triaged, the second is what
 * Datadog source-maps stack frames against.
 */

const REDACTED = '<redacted>';

/**
 * Registrable domains Harper owns. Studio itself, the central-manager API, and Fabric instances
 * all sit under one of these. Matched by suffix, so a new subdomain or environment is covered
 * without an edit here; `localhost` covers a locally registered instance.
 */
const HARPER_DOMAINS = ['harper.fast', 'harperfabric.com', 'harperdb.io'];

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

function isHarperHost(hostname: string) {
	return hostname === 'localhost'
		|| HARPER_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

/** A URL carries customer identity in everything after the host — unless the host is ours. */
function carriesCustomerPath(url: URL) {
	const hasPath = url.pathname.length > 1 || !!url.search || !!url.hash;
	return hasPath && !isHarperHost(url.hostname);
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
	if (carriesCustomerPath(url)) {
		// Rebuild by hand rather than via `toString()`: this drops userinfo, query, and fragment
		// (a `?ref=`/`#branch` can name a private branch) without normalizing the rest. `host`
		// rather than `hostname`, so a non-default port survives.
		return `${url.protocol}//${url.host}/${REDACTED}${trailing}`;
	}
	if (url.username || url.password) {
		url.username = '';
		url.password = '';
		return `${url.toString()}${trailing}`;
	}
	return token;
}

/** Redact non-Harper URL paths and URL credentials in `text`. Returns it unchanged if none. */
export function redactErrorText(text: string) {
	return text
		.replace(URL_TOKEN, redactUrl)
		.replace(SCP_GIT_REMOTE, `$1:${REDACTED}`);
}
