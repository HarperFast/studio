export function sortByEmail(a: { email: string }, b: { email: string }) {
	return a.email > b.email ? 1 : -1;
}
