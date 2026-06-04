export function currentUrlAfterHash(): string {
	const hash = location.hash;
	if (!hash) {
		return '/';
	}
	return hash.startsWith('#/') ? hash.slice(1) : hash;
}
