import { pluralize } from '@/lib/pluralize';

const ORDINAL_SUFFIX: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' };
const ordinalRules = new Intl.PluralRules('en-US', { type: 'ordinal' });

/**
 * When a self-serve cluster bought today renews. central-manager anchors the cycle to the purchase
 * moment and clamps it to the last day of shorter months (grants.js nextCycleEnd), so in the
 * customer's own calendar it lands on today's day number.
 */
export function renewalTerms(expirationMonths: number | false | undefined, today = new Date()): string {
	if (!expirationMonths) { return 'It renews automatically.'; }
	const day = today.getDate();
	const onDay = `the ${day}${ORDINAL_SUFFIX[ordinalRules.select(day)]}`;
	const shorterMonths = day > 28 ? ' (or the last day of shorter months)' : '';
	return expirationMonths === 1
		? `It renews automatically on ${onDay} of each month${shorterMonths}.`
		: `It renews automatically every ${pluralize(expirationMonths, 'month', 'months')}, on ${onDay}${shorterMonths}.`;
}
