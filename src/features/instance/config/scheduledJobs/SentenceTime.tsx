import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatFullTimestamp, formatRelativeTime } from '@/features/organization/serviceAccounts/lib/timeText';

export function SentenceTime({ value }: { value: string }) {
	// `Intl.RelativeTimeFormat` throws on an invalid date; a bad timestamp from Harper must not take the page down.
	if (Number.isNaN(Date.parse(value))) {
		return <span>at an unreadable time</span>;
	}
	const text = formatRelativeTime(value);
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<time dateTime={value} tabIndex={0} className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
					{text.charAt(0).toLowerCase() + text.slice(1)}
				</time>
			</TooltipTrigger>
			<TooltipContent>{formatFullTimestamp(value)}</TooltipContent>
		</Tooltip>
	);
}
