const CYCLE_DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function cycleRange({ startsAt, endsAt }: { startsAt: string | null; endsAt: string }): string {
	const end = new Date(endsAt);
	if (Number.isNaN(end.getTime())) { return 'Billing cycle'; }
	const start = startsAt ? new Date(startsAt) : null;
	if (!start || Number.isNaN(start.getTime()) || start >= end) { return `Ended ${CYCLE_DATE.format(end)}`; }
	return CYCLE_DATE.formatRange(start, end);
}
