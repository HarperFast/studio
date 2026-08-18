const REDACTED = '<redacted>';

/** Credential params. None of these has any diagnostic value, so the whole value goes. */
const CREDENTIAL_PARAM = 'me|email|token|access_token|id_token|refresh_token|code|secret|password|api_?key';

/**
 * A credential value runs to the next `&`/`#`, whitespace, or a delimiter `zodRequireEmail` rejects.
 * It deliberately does not end at `'`, `(`, `)`, `!`, `~` or `*`, which that validator accepts and
 * `encodeURIComponent` leaves bare: ending there would emit `?email=<redacted>'reilly%40example.com`
 * and ship most of the address, and a partial redaction still identifies the person while looking
 * handled. The backslash is a delimiter because consuming it corrupts the escaping of a JSON payload
 * quoted in an error message.
 */
const CREDENTIAL_VALUE = String.raw`[^&#\s",<>[\]{}|\\]+`;

/**
 * An address is matched as a *token*, anywhere in the string, rather than as "a param value up to
 * the next delimiter". That covers the three shapes a delimiter-terminated value cannot: an
 * unencoded JSON value (`?filter={"user":"a@b.com"}`), a path segment (`/config/users/<address>`),
 * and a param no auth screen owns. Requiring a dot-TLD keeps `?pkg=@harperdb/client` and
 * `?ref=main@HEAD` readable.
 *
 * It applies to URL fields only. `user@host.tld` is also the shape of an scp-style git remote, and
 * free error text is where those appear — `redactErrorText` owns URL and remote semantics there, and
 * deliberately keeps the host (`git@github.com:<redacted>`) for triage.
 */
const ADDRESS = String.raw`[\w.%+-]+(?:@|%40)[\w-]+(?:[.-][\w-]+)*\.\w{2,}`;

const CREDENTIAL = new RegExp(String.raw`([?&](?:${CREDENTIAL_PARAM})=)${CREDENTIAL_VALUE}`, 'gi');
const CREDENTIAL_OR_ADDRESS = new RegExp(
	String.raw`([?&](?:${CREDENTIAL_PARAM})=)${CREDENTIAL_VALUE}|${ADDRESS}`,
	'gi',
);

/** Mirrors `redactErrorText`: a URL ending a clause shouldn't lose the punctuation after it. */
const TRAILING_PUNCTUATION = /[.,:;!?]+$/;

/** Nothing can match without one of these, and most Studio URLs are a bare hash route. */
const WORTH_SCANNING = /[?&@]|%40/;

function redactMatch(match: string, param: string | undefined) {
	if (param === undefined) {
		return REDACTED;
	}
	const trailing = TRAILING_PUNCTUATION.exec(match)?.[0] ?? '';
	return `${param}${REDACTED}${trailing}`;
}

/**
 * For a field that is entirely a URL. Studio uses hash routing, so these params sit in the fragment:
 * `new URL(url).search` is empty and a `URLSearchParams` implementation would silently do nothing.
 * Hence the string match.
 */
export function redactSensitiveParams(url: string) {
	if (!WORTH_SCANNING.test(url)) {
		return url;
	}
	return url.replace(CREDENTIAL_OR_ADDRESS, redactMatch);
}

/** For free text, where `redactErrorText` already owns URL and git-remote redaction. */
export function redactCredentialParams(text: string) {
	if (!text.includes('?') && !text.includes('&')) {
		return text;
	}
	return text.replace(CREDENTIAL, redactMatch);
}
