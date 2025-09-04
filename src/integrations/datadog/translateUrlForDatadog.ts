export function translateUrlForDatadog(href: string, params: Record<string, string>): string {
	let translated = href.split('?')[0];
	if (!translated.endsWith('/')) {
		translated = translated + '/';
	}
	for (const key in params) {
		translated = translated.replace(`/${params[key]}/`, `/$${key}/`);
	}
	return translated;
}
