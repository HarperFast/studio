const REDACTED = '<redacted>';

const CREDENTIAL_PARAM = 'me|email|token|access_token|id_token|refresh_token|code|secret|password|api_?key';

/** Not `'()!~*`: `zodRequireEmail` accepts them and `encodeURIComponent` leaves them bare, so ending
 * there would emit `?email=<redacted>'reilly%40example.com`. Backslash, so escaped JSON survives. */
const CREDENTIAL_VALUE = String.raw`[^&#\s",<>[\]{}|\\]+`;

/** A token, not a delimited value: a delimited one can't reach a path segment or unencoded JSON, and
 * every delimiter set trades one for the other. Separators must stay `\.` alone — with `[.-]` while
 * `[\w-]+` also matches `-`, an `@` before a long hyphenated token backtracked 8.7s at 30 chars. */
const ADDRESS = String.raw`[\w.%+!~*'()-]+(?:@|%40)[\w-]+(?:\.[\w-]+)*\.\w{2,}`;

const CREDENTIAL = new RegExp(String.raw`([?&](?:${CREDENTIAL_PARAM})=)${CREDENTIAL_VALUE}`, 'gi');
const CREDENTIAL_OR_ADDRESS = new RegExp(
	String.raw`([?&](?:${CREDENTIAL_PARAM})=)${CREDENTIAL_VALUE}|${ADDRESS}`,
	'gi',
);

const TRAILING_PUNCTUATION = /[.,:;!?]+$/;
const WORTH_SCANNING = /[?&@]|%40/;

function redactMatch(match: string, param: string | undefined) {
	if (param === undefined) {
		return REDACTED;
	}
	const trailing = TRAILING_PUNCTUATION.exec(match)?.[0] ?? '';
	return `${param}${REDACTED}${trailing}`;
}

/** For a field that is entirely a URL. Hash routing puts these params in the fragment, where
 * `new URL(url).search` is empty — a `URLSearchParams` implementation would do nothing. */
export function redactSensitiveParams(url: string) {
	if (!WORTH_SCANNING.test(url)) {
		return url;
	}
	return url.replace(CREDENTIAL_OR_ADDRESS, redactMatch);
}

/** For free text, where the address token would also match an scp git remote and take the host out
 * of the `git@github.com:<redacted>` that `redactErrorText` keeps for triage. */
export function redactCredentialParams(text: string) {
	if (!text.includes('?') && !text.includes('&')) {
		return text;
	}
	return text.replace(CREDENTIAL, redactMatch);
}
