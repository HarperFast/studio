/**
 * A list of common second-level domains used in country-code TLDs (ccTLDs).
 * This helps identify if a domain like 'example.co.uk' should be treated
 * as a root domain (returning '@') or if 'co' is the subdomain.
 */
const COMMON_SLDS = new Set([
	'com',
	'co',
	'org',
	'net',
	'edu',
	'gov',
	'mil',
	'me',
	'biz',
	'info',
	'ac',
	'or',
	'ne',
	'go',
	'lg',
	'asn',
	'id',
	'nom',
	'sch',
	'ltd',
	'plc',
]);

export function extractDomainFromTLD(domain: string): string | '@' {
	const parts = domain.split('.');
	if (parts.length <= 2) {
		return '@';
	}

	const lastPart = parts[parts.length - 1];
	const secondToLastPart = parts[parts.length - 2];

	const isMultiPartTld = lastPart.length === 2 && COMMON_SLDS.has(secondToLastPart);
	const rootPartCount = isMultiPartTld ? 3 : 2;

	if (parts.length <= rootPartCount) {
		return '@';
	}

	return parts.slice(0, -rootPartCount).join('.');
}
