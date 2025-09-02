const localHostnames = [
	'localhost',
	'127.0.0.1',
];

export const enum CrossLocalhostIssueType {
	MixedLoopback = 'MixedLoopback',
	InsecureCookieOutsideChromeAndFirefox = 'InsecureCookieOutsideChromeAndFirefox',
}

export function detectCrossLocalhostUrls(
	userAgent: string | undefined,
	browserHostname: string | undefined,
	operationsUrl: string | undefined | null,
): CrossLocalhostIssueType | null {
	if (!operationsUrl || !browserHostname || !userAgent) {
		return null;
	}
	const serverHostname = new URL(operationsUrl).hostname;
	const browserIsLocal = localHostnames.includes(browserHostname);
	const serverIsLocal = localHostnames.includes(serverHostname);

	if (browserIsLocal && serverIsLocal && serverHostname !== browserHostname) {
		// When running Studio locally and self-managing locally, warn when we mix localhost and 127.0.0.1.
		return CrossLocalhostIssueType.MixedLoopback;
	}

	if (!browserIsLocal && serverIsLocal) {
		const isChromium = userAgent.indexOf('Chrome') >= 0;
		const isFirefox = userAgent.indexOf('Firefox') >= 0;
		if (!isChromium && !isFirefox) {
			// When running Studio in the cloud, and signing in to a local instance, Chrome and Firefox allow the
			// cookies to cross to the insecure localhost because they consider it to be secure enough.
			// https://github.com/httpwg/http-extensions/issues/2605
			return CrossLocalhostIssueType.InsecureCookieOutsideChromeAndFirefox;
		}
	}

	return null;
}
