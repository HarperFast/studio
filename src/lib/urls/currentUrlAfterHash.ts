export function currentUrlAfterHash(): string {
	const parsed = URL.parse(location.href);
	if (!parsed?.hash) {
		return '/';
	}
	return parsed.hash.startsWith('#/') ? parsed.hash.slice(1) : parsed.hash;
}
