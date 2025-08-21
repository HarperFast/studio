export function currentUrlAfterHash(): string {
	const parsed = URL.parse(location.href);
	if (!parsed) {
		return '/';
	}
	return parsed.hash.startsWith('#/') ? parsed.hash.slice(1) : parsed.hash;
}
