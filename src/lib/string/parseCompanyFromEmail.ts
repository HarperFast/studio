const commonProviders = [
	'gmail.com',
	'yahoo.com',
	'hotmail.com',
	'outlook.com',
	'icloud.com',
	'aol.com',
	'protonmail.com',
	'mail.com',
	'zoho.com',
	'yandex.com',
	'gmx.com',
	'live.com',
	'msn.com',
	'me.com',
	'inbox.com',
];

export function parseCompanyFromEmail(email: string): string | null {
	if (!email || !email.includes('@')) {
		return null;
	}

	const domain = email.split('@').pop() || '';
	if (!domain) {
		return null;
	}

	// Check if the domain is a common provider or a subdomain of a common provider
	for (const provider of commonProviders) {
		if (domain === provider || domain.endsWith('.' + provider)) {
			return null;
		}
	}

	return domain;
}
