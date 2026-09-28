import { pluralize } from '@/lib/pluralize';

const ORDINAL_SUFFIX: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' };
const ordinalRules = new Intl.PluralRules('en-US', { type: 'ordinal' });

/**
 * When a self-serve cluster renews. central-manager anchors the cycle to the purchase moment and
 * clamps it to the last day of shorter months (grants.js nextCycleEnd), so in the customer's own
 * calendar a purchase made today renews on today's day number. `startsOn` is null when the day is
 * not known here — an edit restarts the cycle only if it mints, which only the server decides.
 */
export function renewalTerms(expirationMonths: number | false | undefined, startsOn: Date | null): string {
	if (!expirationMonths) { return 'It renews automatically.'; }
	if (!startsOn) {
		return `It renews automatically ${
			expirationMonths === 1 ? 'each month' : `every ${pluralize(expirationMonths, 'month', 'months')}`
		}.`;
	}
	const day = startsOn.getDate();
	const onDay = `the ${day}${ORDINAL_SUFFIX[ordinalRules.select(day)]}`;
	// central-manager clamps on the UTC day, so near month-end a short month can land a day either side locally.
	const shorterMonths = day > 28 || startsOn.getUTCDate() > 28 ? ' (around the last day in shorter months)' : '';
	return expirationMonths === 1
		? `It renews automatically on ${onDay} of each month${shorterMonths}.`
		: `It renews automatically every ${pluralize(expirationMonths, 'month', 'months')}, on ${onDay}${shorterMonths}.`;
}
