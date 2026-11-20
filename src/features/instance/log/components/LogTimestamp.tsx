import { formatRelativeTime } from '@/features/organization/serviceAccounts/lib/timeText';
import { useEffect, useState } from 'react';

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat(undefined, {
	hour: 'numeric',
	minute: '2-digit',
	second: '2-digit',
	fractionalSecondDigits: 3,
	hour12: true,
});

export function LogTimestamp({ value }: { value: string }) {
	const [now, setNow] = useState(Date.now);
	const valid = Number.isFinite(Date.parse(value));
	useEffect(() => {
		if (!valid) { return; }
		const timer = setInterval(() => setNow(Date.now()), 60000);
		return () => clearInterval(timer);
	}, [valid]);
	if (!valid) { return <>{value}</>; }
	const date = new Date(value);
	const relative = formatRelativeTime(date, now);
	return (
		<time dateTime={value} title={date.toISOString()}>
			{dateFormat.format(date)} at {timeFormat.format(date).toLocaleLowerCase()}{' '}
			<span className="text-muted-foreground">({relative.charAt(0).toLocaleLowerCase() + relative.slice(1)})</span>
		</time>
	);
}
