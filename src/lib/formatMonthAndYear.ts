export function formatMonthAndYear(month: number, year: number): string {
	const mm = String(month).padStart(2, '0');
	// Use two-digit year for typical card expiration display
	const yy = String(year % 100).padStart(2, '0');
	return `${mm}/${yy}`;
}
