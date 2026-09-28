import { pluralize } from '@/lib/pluralize';

const ORDINAL_SUFFIX: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' };
const ordinalRules = new Intl.PluralRules('en-US', { type: 'ordinal' });

/**
 * When a self-serve cluster renews. central-manager anchors the cycle to the purchase moment on the
 * UTC calendar and clamps it into shorter months (grants.js nextCycleEnd). A day is named only when
 * it holds every month in the customer's own calendar: the local and UTC dates agree and no month
 * is too short for it. `startsOn` is null when the start is not known here — an edit restarts the
 * cycle only if it mints, which only the server decides.
 */
export function renewalTerms(expirationMonths: number | false | undefined, startsOn: Date | null): string {
	if (!expirationMonths) { return 'It renews automatically.'; }
	const every = expirationMonths === 1 ? 'each month' : `every ${pluralize(expirationMonths, 'month', 'months')}`;
	const day = startsOn?.getDate();
	if (!startsOn || !day || day !== startsOn.getUTCDate() || day > 28) { return `It renews automatically ${every}.`; }
	const onDay = `the ${day}${ORDINAL_SUFFIX[ordinalRules.select(day)]}`;
	return expirationMonths === 1
		? `It renews automatically on ${onDay} of each month.`
		: `It renews automatically ${every}, on ${onDay}.`;
}
